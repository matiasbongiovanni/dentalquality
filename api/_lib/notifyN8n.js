const fetch = require('node-fetch');
const crypto = require('crypto');

const N8N_TIMEOUT_MS = 12000;

async function notifyN8n(payload, sourceTag) {
    const url = (process.env.N8N_WEBHOOK_URL || '').trim();
    if (!url) {
        return { ok: false, skipped: true, reason: 'N8N_WEBHOOK_URL no configurada' };
    }

    const secret = (process.env.N8N_WEBHOOK_SECRET || '').trim();
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[notifyN8n] CRÍTICO: N8N_WEBHOOK_SECRET no configurada en producción. Webhook bloqueado.');
            return { ok: false, skipped: true, reason: 'N8N_WEBHOOK_SECRET requerida en producción' };
        }
        console.warn('[notifyN8n] ADVERTENCIA: N8N_WEBHOOK_SECRET no configurada. Los webhooks no están firmados.');
    }

    const finalPayload = {
        ...payload,
        calendar: {
            ...(payload.calendar || {}),
            last_updated_by_meta: { source: sourceTag }
        }
    };

    const headers = { 'Content-Type': 'application/json' };
    if (secret) {
        const sig = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(finalPayload))
            .digest('hex');
        headers['X-Meteoro-Signature'] = sig;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
    const start = Date.now();

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(finalPayload),
            signal: controller.signal
        });
        const durationMs = Date.now() - start;
        return { ok: res.ok, status: res.status, durationMs, source: sourceTag };
    } catch (error) {
        return { ok: false, error: error.message, source: sourceTag };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { notifyN8n };
