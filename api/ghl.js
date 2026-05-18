const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { path } = req.query;
    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const GHL_BASE = 'https://services.leadconnectorhq.com';
    // Reconstruir la URL de GHL (path viene como string o array)
    const targetPath = Array.isArray(path) ? path.join('/') : path;
    
    // Obtener los query params originales y sacar el "path"
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'path') {
            queryParams.append(key, value);
        }
    }
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const ghlUrl = `${GHL_BASE}/${targetPath}${queryString}`;
    
    // Configurar API Key de GHL
    const GHL_LOCATION_ID = 'fotG33HIQ58UyWeEbpx9';
    const GHL_API_KEY = 'Bearer pit-70d37e69-00ab-4416-ab7e-6617dd2ef9fe'; // En prod idealmente usar variables de entorno

    const fetchOptions = {
        method: req.method,
        headers: {
            'Authorization': GHL_API_KEY,
            'Version': '2021-07-28',
            'Accept': 'application/json'
        }
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    try {
        const ghlRes = await fetch(ghlUrl, fetchOptions);
        const data = await ghlRes.json();
        res.status(ghlRes.status).json(data);
    } catch (error) {
        console.error('[Vercel API] Error calling GHL:', error);
        res.status(500).json({ error: 'Failed to fetch from GHL API', details: error.message });
    }
};
