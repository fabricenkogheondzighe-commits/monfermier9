// api/Sanny.js — Proxy OpenRouter pour Vercel
// La clé API est dans Vercel → Settings → Environment Variables → OPENROUTER_API_KEY

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

    // Extraire le system prompt
    let systemPrompt = body.system || null;
    if (!systemPrompt) {
      const sysMsg = messages.find(m => m.role === "system");
      if (sysMsg) {
        systemPrompt = typeof sysMsg.content === "string" ? sysMsg.content : (sysMsg.content[0]?.text || "");
        messages = messages.filter(m => m.role !== "system");
      }
    }

    // Convertir messages au format OpenAI
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

    const payload = {
      model: "google/gemma-4-27b-it:free",
      max_tokens: body.max_tokens || 1024,
      messages: openaiMessages
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://monfermier9.vercel.app",
        "X-Title": "Mon Fermier"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Erreur OpenRouter" });
    }

    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({
      id: "openrouter-response",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: payload.model,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 }
    });

  } catch (err) {
    console.error("Erreur OpenRouter:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
