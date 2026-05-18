// Proxy local solo para desarrollo. En producción se usa api/ghl.js (Vercel serverless).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const GHL_KEY = process.env.GHL_API_KEY;
if (!GHL_KEY) {
    console.error('ERROR: GHL_API_KEY no está en .env');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_HEADERS = {
    'Authorization': `Bearer ${GHL_KEY}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
};

app.all('/ghl/*', async (req, res) => {
    const path = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const url = `${GHL_BASE}/${path}${query ? '?' + query : ''}`;

    try {
        const opts = { method: req.method, headers: GHL_HEADERS };
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            opts.body = JSON.stringify(req.body);
        }
        const ghlRes = await fetch(url, opts);
        const data = await ghlRes.json();
        res.status(ghlRes.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PROXY_PORT || 3001;
app.listen(PORT, () => console.log(`Proxy GHL corriendo en http://localhost:${PORT}`));
