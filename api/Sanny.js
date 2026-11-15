// api/Sanny.js — Proxy IA pour Sanny (Groq) + Caméra IA
// Deployer dans le dossier /api/ de votre projet Vercel
//
// Variables Vercel :
//   GROQ_API_KEY      (obligatoire)
//   GROQ_MODEL        (optionnel, texte, defaut : openai/gpt-oss-120b)
//   GROQ_VISION_MODEL (modele vision pour la Camera IA)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const body = req.body;
    const model = body.model || '';

    const GROQ_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_KEY) {
      return res.status(500).json({ error: 'Clé GROQ_API_KEY manquante sur Vercel' });
    }

    // groq-vision → appel avec images (Caméra IA)
    const isVision = model === 'groq-vision';
    const groqModel = isVision
      ? process.env.GROQ_VISION_MODEL
      : (process.env.GROQ_MODEL || 'openai/gpt-oss-120b');

    if (!groqModel) {
      return res.status(501).json({
        error: 'Vision indisponible',
        detail: 'Aucun modele vision configure (GROQ_VISION_MODEL)'
      });
    }

    // Construire les messages selon le type
    let messages;
    if (isVision) {
      // Pour la vision : system injecté dans le premier message user
      const userMsg = body.messages && body.messages[0];
      const systemText = body.system ? cleanString(body.system) + '\n\n' : '';
      messages = [{
        role: 'user',
        content: userMsg ? userMsg.content.map(part => {
          if (part.type === 'text') return { type: 'text', text: systemText + cleanString(part.text) };
          if (part.type === 'image_url') return part;
          return part;
        }) : [{ type: 'text', text: systemText }]
      }];
    } else {
      // Chat normal
      messages = (body.messages || []).map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? cleanString(msg.content)
          : msg.content
      }));
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify({
        model: groqModel,
        max_tokens: body.max_tokens || 1500,
        messages: messages
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('[Sanny/Groq] Erreur Groq:', groqRes.status, errText.substring(0, 300));
      return res.status(groqRes.status).json({
        error: 'Erreur serveur',
        detail: errText.substring(0, 300)
      });
    }

    const groqData = await groqRes.json();
    return res.status(200).json(groqData);

  } catch (err) {
    console.error('[Sanny] Exception:', err.message);
    return res.status(500).json({ error: 'Exception serveur', detail: err.message });
  }
}

// ── Nettoyage Unicode ────────────────────────────────────────────────────────
function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}
