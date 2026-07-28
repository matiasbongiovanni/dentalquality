const fetch = require('node-fetch');
const crypto = require('crypto');

const N8N_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function postOnce(url, headers, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);
    const start = Date.now();
    try {
        const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
        return { ok: res.ok, status: res.status, durationMs: Date.now() - start };
    } catch (error) {
        return { ok: false, error: error.message, durationMs: Date.now() - start };
    } finally {
        clearTimeout(timer);
    }
}

async function notifyN8n(payload, sourceTag) {
    const url = (process.env.N8N_WEBHOOK_URL || '').trim();
    if (!url) {
        return { ok: false, skipped: true, reason: 'N8N_WEBHOOK_URL no configurada' };
    }

    const secret = (process.env.N8N_WEBHOOK_SECRET || '').trim();
    if (!secret) {
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

    const body = JSON.stringify(finalPayload);
    let lastResult;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        lastResult = await postOnce(url, headers, body);
        if (lastResult.ok) {
            return { ...lastResult, attempts: attempt, source: sourceTag };
        }
        console.error(`[notifyN8n] intento ${attempt}/${MAX_ATTEMPTS} falló`, {
            status: lastResult.status,
            error: lastResult.error,
            durationMs: lastResult.durationMs
        });
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
    return { ...lastResult, attempts: MAX_ATTEMPTS, source: sourceTag };
}

module.exports = { notifyN8n };
