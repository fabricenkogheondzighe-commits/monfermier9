// api/Sanny.js — Proxy OpenRouter pour Sanny assistante (texte uniquement)
// OPENROUTER_API_KEY dans Vercel → Settings → Environment Variables

export const maxDuration = 60;

const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
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
        // Texte seulement pour Sanny
        const text = msg.content.filter(i => i.type === "text").map(i => i.text).join("\n");
        openaiMessages.push({ role: msg.role, content: text });
      }
    }

    const selectedModel = MODELS[0];
    const payload = {
      model: selectedModel,
      max_tokens: Math.min(body.max_tokens || 800, 1000),
      messages: openaiMessages,
      temperature: 0.7,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://monfermier9.vercel.app",
          "X-Title": "Mon Fermier — Sanny"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ error: "Délai dépassé", detail: "Réessayez ou posez une question plus courte." });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || "Erreur OpenRouter";
      return res.status(response.status).json({ error: errMsg, detail: errMsg });
    }

    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      id: "sanny-response",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: selectedModel,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 }
    });

  } catch (err) {
    console.error("Erreur Sanny:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
