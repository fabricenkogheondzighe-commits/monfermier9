// api/Sanny.js — Proxy Anthropic pour Vercel
// La clé API est dans Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API manquante côté serveur" });

  try {
    // Parser le body manuellement si nécessaire
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: "JSON invalide" }); }
    }
    if (!body) return res.status(400).json({ error: "Body vide" });

    // Traiter les messages
    let messages = body.messages || [];

    // Convertir image_url (OpenAI) → image base64 (Anthropic) si nécessaire
    messages = messages.map(msg => {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const newContent = msg.content.map(item => {
          if (item.type === "image_url" && item.image_url && item.image_url.url) {
            const dataUrl = item.image_url.url;
            const match = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/s);
            if (match) {
              return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
            }
          }
          return item;
        });
        return { ...msg, content: newContent };
      }
      return msg;
    });

    // Extraire le system prompt
    let systemPrompt = body.system || null;
    if (!systemPrompt) {
      const sysMsg = messages.find(m => m.role === "system");
      if (sysMsg) {
        systemPrompt = typeof sysMsg.content === "string" ? sysMsg.content : (sysMsg.content[0]?.text || "");
        messages = messages.filter(m => m.role !== "system");
      }
    }

    // Payload final pour Anthropic
    const payload = {
      model: body.model || "claude-sonnet-4-5",
      max_tokens: body.max_tokens || 1024,
      messages: messages
    };
    if (systemPrompt) payload.system = systemPrompt;

    // Appel Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("Erreur proxy Sanny:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
