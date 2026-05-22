const fetch = require('node-fetch');
const { isAllowed } = require('./_lib/ghlAllowlist');
const { isRateLimited, getClientIp } = require('./_lib/rateLimit');

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();
const GHL_LOCATION_ID = (process.env.GHL_LOCATION_ID || '').trim();

/** POST: locationId va en el body (GHL rechaza si también está en query) */
const LOCATION_IN_BODY = [
    /^contacts\/?$/,
    /^calendars\/events\/appointments\/?$/,
];

/** GET: locationId va en query string */
const LOCATION_IN_QUERY = [
    /^contacts\/search\/duplicate$/,
];

function normalizePath(path) {
    return String(path || '').replace(/^\/+/, '');
}

function matchesAny(patterns, path) {
    return patterns.some((rx) => rx.test(path));
}

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

    const normalizedPath = normalizePath(targetPath);
    const method = (req.method || 'GET').toUpperCase();

    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
        if (key === 'path') continue;
        // locationId en query solo lo define el servidor (evita suplantación)
        if (key === 'locationId' && GHL_LOCATION_ID) continue;
        queryParams.append(key, value);
    }
    if (
        GHL_LOCATION_ID &&
        method === 'GET' &&
        matchesAny(LOCATION_IN_QUERY, normalizedPath)
    ) {
        queryParams.set('locationId', GHL_LOCATION_ID);
    }

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

    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        let payload = req.body;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (_) { /* passthrough */ }
        }
        const injectLocationInBody =
            GHL_LOCATION_ID &&
            method === 'POST' &&
            matchesAny(LOCATION_IN_BODY, normalizedPath);

        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const { locationId: _clientLoc, ...rest } = payload;
            if (injectLocationInBody) {
                payload = { ...rest, locationId: GHL_LOCATION_ID };
            } else {
                payload = rest;
            }
        }
        fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }

    try {
        const ghlRes = await fetch(ghlUrl, fetchOptions);
        const data = await ghlRes.json();
        res.status(ghlRes.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar con GHL' });
    }
};
