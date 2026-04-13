// api/Sanny.js — Proxy OpenRouter pour Vercel
// La clé API est dans Vercel → Settings → Environment Variables → OPENROUTER_API_KEY

// Augmente le timeout Vercel à 60s (nécessite plan Pro, sinon 10s sur Free)
export const maxDuration = 60;

// Modèles par ordre de priorité : rapide → fallback
const MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",   // Gratuit, très rapide
  "mistralai/mistral-7b-instruct:free",        // Fallback gratuit
  "nousresearch/hermes-3-llama-3.1-8b",        // Fallback payant rapide
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API OpenRouter manquante" });

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: "JSON invalide" }); }
    }
    if (!body) return res.status(400).json({ error: "Body vide" });

    let messages = body.messages || [];

    let systemPrompt = body.system || null;
    if (!systemPrompt) {
      const sysMsg = messages.find(m => m.role === "system");
      if (sysMsg) {
        systemPrompt = typeof sysMsg.content === "string" ? sysMsg.content : (sysMsg.content[0]?.text || "");
        messages = messages.filter(m => m.role !== "system");
      }
    }

    const openaiMessages = [];
    if (systemPrompt) openaiMessages.push({ role: "system", content: systemPrompt });

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        openaiMessages.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const parts = msg.content.map(item => {
          if (item.type === "text") return { type: "text", text: item.text };
          if (item.type === "image" && item.source?.type === "base64") {
            return { type: "image_url", image_url: { url: `data:${item.source.media_type};base64,${item.source.data}` } };
          }
          if (item.type === "image_url") return item;
          return { type: "text", text: "" };
        });
        openaiMessages.push({ role: msg.role, content: parts });
      }
    }

    // Choisir le modèle : priorité au modèle demandé si ce n'est pas "openrouter/auto"
    const requestedModel = body.model && body.model !== "openrouter/auto" ? body.model : null;
    const selectedModel = requestedModel || MODELS[0];

    const payload = {
      model: selectedModel,
      max_tokens: Math.min(body.max_tokens || 600, 800), // Limité à 800 max pour éviter timeout
      messages: openaiMessages,
      temperature: 0.7,
    };

    // Tentative avec timeout de 8s pour laisser de la marge à Vercel Free
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://monfermier9.vercel.app",
          "X-Title": "Mon Fermier"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      // Si timeout → réessayer avec le modèle fallback
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({
          error: "Délai dépassé",
          detail: "Le modèle IA met trop longtemps. Réessayez ou posez une question plus courte."
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      // Si modèle indisponible, suggérer de réessayer
      const errMsg = data.error?.message || "Erreur OpenRouter";
      return res.status(response.status).json({
        error: errMsg,
        detail: response.status === 429 ? "Limite de requêtes atteinte. Attendez quelques secondes." : errMsg
      });
    }

    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      id: "openrouter-response",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: selectedModel,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 }
    });

  } catch (err) {
    console.error("Erreur OpenRouter:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
