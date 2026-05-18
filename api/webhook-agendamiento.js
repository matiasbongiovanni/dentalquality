const fetch = require('node-fetch');
const crypto = require('crypto');
const { validateAgendamiento } = require('./_lib/validate');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
    if (!N8N_WEBHOOK_URL) {
        return res.status(500).json({ error: 'N8N_WEBHOOK_URL no configurada' });
    }

    const body = req.body;

    const validation = validateAgendamiento(body);
    if (!validation.ok) {
        return res.status(400).json({ error: 'Payload inválido', errors: validation.errors });
    }

    // Forzar source para que el workflow de n8n lo procese
    const payload = {
        ...body,
        calendar: {
            ...body.calendar,
            last_updated_by_meta: { source: 'Web Agendamiento' }
        }
    };

    const headers = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (secret) {
        const sig = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        headers['X-Meteoro-Signature'] = sig;
    }

    const start = Date.now();
    try {
        const n8nRes = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const durationMs = Date.now() - start;
        const appointmentId = body.calendar?.appointmentId;
        const dni = String(body.DNI || '').slice(0, 4) + '****';
        console.log(JSON.stringify({ appointmentId, dni, status: n8nRes.status, durationMs }));

        if (!n8nRes.ok) {
            return res.status(502).json({ error: 'El workflow no procesó la solicitud', n8nStatus: n8nRes.status });
        }

        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(502).json({ error: 'No se pudo contactar el webhook de n8n' });
    }
};
