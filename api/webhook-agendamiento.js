const { validateAgendamiento } = require('./_lib/validate');
const { notifyN8n } = require('./_lib/notifyN8n');
const { isRateLimited, getClientIp } = require('./_lib/rateLimit');

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip, 10, 'webhook')) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' });
    }

    const body = req.body;
    const validation = validateAgendamiento(body);
    if (!validation.ok) {
        return res.status(400).json({ error: 'Payload inválido', errors: validation.errors });
    }

    const result = await notifyN8n(body, 'Web Agendamiento');

    const appointmentId = body.calendar?.appointmentId;
    const dni = String(body.DNI || '').slice(0, 4) + '****';
    console.log(JSON.stringify({
        action: 'agendamiento',
        appointmentId,
        dni,
        n8nStatus: result.status,
        n8nOk: result.ok,
        durationMs: result.durationMs
    }));

    if (result.skipped) {
        return res.status(500).json({ error: 'N8N_WEBHOOK_URL no configurada' });
    }
    if (!result.ok) {
        return res.status(502).json({ error: 'El workflow no procesó la solicitud', n8nStatus: result.status });
    }

    res.status(200).json({ ok: true });
};
