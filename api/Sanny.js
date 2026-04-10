// api/Sanny.js — Proxy Gemini pour Vercel
// La clé API est dans Vercel → Settings → Environment Variables → GEMINI_API_KEY

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API Gemini manquante côté serveur" });

  try {
    // Parser le body
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

    // Convertir messages au format Gemini
    const geminiContents = messages.map(msg => {
      const role = msg.role === "assistant" ? "model" : "user";

      if (typeof msg.content === "string") {
        return { role, parts: [{ text: msg.content }] };
      }

      if (Array.isArray(msg.content)) {
        const parts = msg.content.map(item => {
          if (item.type === "text") {
            return { text: item.text };
          }
          // Image base64 (format Anthropic)
          if (item.type === "image" && item.source?.type === "base64") {
            return {
              inlineData: {
                mimeType: item.source.media_type,
                data: item.source.data
              }
            };
          }
          // Image URL base64 (format OpenAI)
          if (item.type === "image_url" && item.image_url?.url) {
            const dataUrl = item.image_url.url;
            const match = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/s);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2]
                }
              };
            }
          }
          return { text: "" };
        });
        return { role, parts };
      }

      return { role, parts: [{ text: String(msg.content) }] };
    });

    // Payload Gemini
    const payload = {
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1024,
        temperature: 0.7
      }
    };

    // Ajouter system prompt si présent
    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    // Appel API Gemini
    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Erreur Gemini" });
    }

    // Convertir réponse Gemini → format Anthropic (compatible avec ton frontend)
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const anthropicFormat = {
      id: "gemini-response",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: model,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 }
    };

    return res.status(200).json(anthropicFormat);

  } catch (err) {
    console.error("Erreur proxy Gemini:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
