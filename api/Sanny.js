// api/Sanny.js — Proxy IA pour Sanny (Groq / Llama) + Claude Vision (Caméra IA)
// Déployer dans le dossier /api/ de votre projet Vercel

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    // Lire le body — Vercel le parse automatiquement en JSON
    const body = req.body;
    const model = body.model || '';

    // ─── ROUTE CLAUDE VISION (Caméra IA / Diagnostic plante) ───────────────
    // Modèles Anthropic : claude-*, claude-sonnet-*, claude-opus-*, claude-haiku-*
    if (model.startsWith('claude')) {
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) {
        return res.status(500).json({ error: 'Clé ANTHROPIC_API_KEY manquante sur Vercel' });
      }

      // Nettoyer les caractères Unicode dans system prompt et messages
      const cleanBody = sanitizeUnicode(body);

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: cleanBody.model,
          max_tokens: cleanBody.max_tokens || 1200,
          system: cleanBody.system || '',
          messages: cleanBody.messages || []
        })
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error('[Sanny/Claude] Erreur Anthropic:', anthropicRes.status, errText.substring(0, 300));
        return res.status(anthropicRes.status).json({
          error: 'Erreur Anthropic',
          detail: errText.substring(0, 300)
        });
      }

      const data = await anthropicRes.json();
      return res.status(200).json(data);
    }

    // ─── ROUTE GROQ / LLAMA (Sanny chat) ────────────────────────────────────
    const GROQ_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_KEY) {
      return res.status(500).json({ error: 'Clé GROQ_API_KEY manquante sur Vercel' });
    }

    // Nettoyer les caractères Unicode dans les messages
    const messages = (body.messages || []).map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? cleanString(msg.content)
        : msg.content
    }));

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify({
        model: model || 'llama3-70b-8192',
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
// Remplace les caractères > U+00FF par leur équivalent ASCII ou les supprime
function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str
    // Tirets typographiques → tiret simple
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    // Guillemets typographiques → guillemets droits
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Points de suspension → trois points
    .replace(/\u2026/g, '...')
    // Espaces insécables → espace normale
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    // Autres caractères > 255 → supprimés
    .replace(/[^\x00-\xFF]/g, '');
}

function sanitizeUnicode(obj) {
  if (typeof obj === 'string') return cleanString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeUnicode);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      out[k] = sanitizeUnicode(obj[k]);
    }
    return out;
  }
  return obj;
}
