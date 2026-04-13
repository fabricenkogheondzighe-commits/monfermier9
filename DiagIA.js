// api/DiagIA.js — Proxy Anthropic direct pour la Caméra IA (vision)
// ANTHROPIC_API_KEY dans Vercel → Settings → Environment Variables

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API Anthropic manquante" });

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: "JSON invalide" }); }
    }
    if (!body) return res.status(400).json({ error: "Body vide" });

    const payload = {
      model: "claude-sonnet-4-5",
      max_tokens: body.max_tokens || 1200,
      system: body.system || "",
      messages: body.messages || [],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ error: "Délai dépassé", detail: "L'analyse de l'image prend trop longtemps." });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Erreur Anthropic",
        detail: data.error?.message
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("Erreur DiagIA:", err);
    return res.status(500).json({ error: "Erreur serveur", detail: err.message });
  }
}
