// api/DiagIA.js — Diagnostic IA plante (Claude Vision)
// Même logique que Sanny.js pour la partie Claude, fichier séparé pour la route /api/DiagIA

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const body = req.body;

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'Clé ANTHROPIC_API_KEY manquante sur Vercel' });
    }

    // Nettoyer les caractères Unicode avant envoi
    const cleanBody = sanitizeUnicode(body);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: cleanBody.model || 'claude-sonnet-4-20250514',
        max_tokens: cleanBody.max_tokens || 1200,
        system: cleanBody.system || '',
        messages: cleanBody.messages || []
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[DiagIA] Erreur Anthropic:', anthropicRes.status, errText.substring(0, 300));
      return res.status(anthropicRes.status).json({
        error: 'Erreur Anthropic',
        detail: errText.substring(0, 300)
      });
    }

    const data = await anthropicRes.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[DiagIA] Exception:', err.message);
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

function sanitizeUnicode(obj) {
  if (typeof obj === 'string') return cleanString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeUnicode);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = sanitizeUnicode(obj[k]);
    return out;
  }
  return obj;
}
