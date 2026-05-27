const fetch = require('node-fetch');
const { isRateLimited, getClientIp } = require('./_lib/rateLimit');

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();
const DEV_ORIGINS = ['https://dentalquality.vercel.app', 'http://localhost:3000', 'http://localhost:5500', 'http://localhost:3001'];

function isOriginAllowed(req) {
    const origin = (req.headers['origin'] || '').trim();
    const referer = (req.headers['referer'] || '').trim();
    if (origin && origin === ALLOWED_ORIGIN) return true;
    if (referer && referer.startsWith(ALLOWED_ORIGIN)) return true;
    if (DEV_ORIGINS.some(o => origin === o || referer.startsWith(o))) return true;
    if (!origin && !referer) return true;
    return false;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

    const ip = getClientIp(req);
    if (isRateLimited(ip, 10, 'confirmacion')) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Demasiadas solicitudes.' });
    }

    const body = req.body || {};
    const email = (body.email || '').trim();

    if (!email) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'sin email' });
    }

    const url = (process.env.N8N_CONFIRMACION_URL || '').trim();
    if (!url) {
        console.warn('[send-confirmacion] N8N_CONFIRMACION_URL no configurada');
        return res.status(200).json({ ok: true, skipped: true, reason: 'N8N_CONFIRMACION_URL no configurada' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const start = Date.now();

    try {
        const n8nRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const durationMs = Date.now() - start;
        const emailMasked = email.replace(/(?<=.{2}).(?=.*@)/g, '*');
        console.log(JSON.stringify({
            action: 'confirmacion',
            appointmentId: body.appointmentId,
            email_masked: emailMasked,
            n8nStatus: n8nRes.status,
            durationMs
        }));
        return res.status(200).json({ ok: n8nRes.ok, status: n8nRes.status });
    } catch (err) {
        console.error('[send-confirmacion] error:', err.message);
        return res.status(200).json({ ok: false, error: err.message });
    } finally {
        clearTimeout(timer);
    }
};
