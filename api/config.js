const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();

// Server-side origin check — complements browser CORS enforcement
function isOriginAllowed(req) {
    const origin = (req.headers['origin'] || '').trim();
    const referer = (req.headers['referer'] || '').trim();
    if (origin && origin === ALLOWED_ORIGIN) return true;
    if (referer && referer.startsWith(ALLOWED_ORIGIN)) return true;
    return false;
}

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    if (!isOriginAllowed(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({
        SUPABASE_URL: (process.env.SUPABASE_URL || '').trim(),
        SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim()
    });
};
