const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const GHL_KEY = 'pit-185339e4-2055-47a3-8b49-7e5850c447e6';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_HEADERS = {
    'Authorization': `Bearer ${GHL_KEY}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
};

// Proxy generico para GHL
app.all('/ghl/*', async (req, res) => {
    const path = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const url = `${GHL_BASE}/${path}${query ? '?' + query : ''}`;

    try {
        const opts = {
            method: req.method,
            headers: GHL_HEADERS
        };
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

// Health check
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Proxy GHL corriendo en http://localhost:${PORT}`));
