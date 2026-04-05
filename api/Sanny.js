// api/Sanny.js — Proxy Anthropic pour Vercel
// La clé API est dans Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API manquante côté serveur" });
  }

  try {
    const body = req.body;

    let messages = body.messages || [];
    messages = messages.map(msg => {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const newContent = msg.content.map(item => {
          if (item.type === "image_url" && item.image_url && item.image_url.url) {
            const dataUrl = item.image_url.url;
            const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: match[1],
                  data: match[2]
                }
              };
            }
          }
          return item;
        });
        return { ...msg, content: newContent };
      }
      return msg;
    });

    let systemPrompt = body.system || null;
    if (!systemPrompt) {
      const sysMsg = messages.find(m => m.role === "system");
      if (sysMsg) {
        systemPrompt = typeof sysMsg.content === "string"
          ? sysMsg.content
          : sysMsg.content[0]?.text || "";
        messages = messages.filter(m => m.role !== "system");
      }
    }

    const payload = {
      model: body.model || "claude-opus-4-5",
      max_tokens: body.max_tokens || 1000,
      messages: messages
    };
    if (systemPrompt) payload.system = systemPrompt;

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
