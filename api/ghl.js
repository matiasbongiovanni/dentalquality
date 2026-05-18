const fetch = require('node-fetch');
const { isAllowed } = require('./_lib/ghlAllowlist');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const GHL_API_KEY = process.env.GHL_API_KEY;
    if (!GHL_API_KEY) {
        return res.status(500).json({ error: 'GHL_API_KEY no configurada' });
    }

    const { path } = req.query;
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const targetPath = Array.isArray(path) ? path.join('/') : path;

    if (!isAllowed(targetPath, req.method)) {
        return res.status(403).json({ error: 'Path no permitido' });
    }

    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'path') queryParams.append(key, value);
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
