const fetch = require('node-fetch');
const { isAllowed } = require('./_lib/ghlAllowlist');
const { isRateLimited, getClientIp } = require('./_lib/rateLimit');

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();
const GHL_LOCATION_ID = (process.env.GHL_LOCATION_ID || '').trim();

// Validate that the request comes from the expected origin (server-side enforcement)
function isOriginAllowed(req) {
    const origin = (req.headers['origin'] || '').trim();
    const referer = (req.headers['referer'] || '').trim();
    if (origin && origin === ALLOWED_ORIGIN) return true;
    if (referer && referer.startsWith(ALLOWED_ORIGIN)) return true;
    return false;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Server-side origin check — CORS alone is browser-only enforcement
    if (!isOriginAllowed(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Rate limit: 60 req/min per IP on the GHL proxy
    const ip = getClientIp(req);
    if (isRateLimited(ip, 60, 'ghl')) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' });
    }

    const GHL_API_KEY = (process.env.GHL_API_KEY || '').trim();
    if (!GHL_API_KEY) {
        return res.status(500).json({ error: 'GHL_API_KEY no configurada' });
    }

    const { path } = req.query;
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }
    if (Array.isArray(path)) {
        return res.status(400).json({ error: 'path parameter must be a single string' });
    }

    const targetPath = path;

    if (!isAllowed(targetPath, req.method)) {
        return res.status(403).json({ error: 'Path no permitido' });
    }

    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
        if (key === 'path') continue;
        // Override locationId with server-side env var to prevent targeting other GHL locations
        if (key === 'locationId' && GHL_LOCATION_ID) continue;
        queryParams.append(key, value);
    }
    // Enforce server-side locationId on all GHL requests
    if (GHL_LOCATION_ID) queryParams.set('locationId', GHL_LOCATION_ID);

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const ghlUrl = `https://services.leadconnectorhq.com/${targetPath}${queryString}`;

    const fetchOptions = {
        method: req.method,
        headers: {
            'Authorization': `Bearer ${GHL_API_KEY}`,
            'Version': '2021-07-28',
            'Accept': 'application/json'
        }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    try {
        const ghlRes = await fetch(ghlUrl, fetchOptions);
        const data = await ghlRes.json();
        res.status(ghlRes.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar con GHL' });
    }
};
