const fetch = require('node-fetch');

const SUPABASE_TIMEOUT_MS = 10000;

function getCreds() {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '').trim();
    if (!url || !key) {
        return { ok: false, reason: 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas' };
    }
    return { ok: true, url, key };
}

function buildUrl(base, path) {
    // Acepta SUPABASE_URL con o sin /rest/v1 al final.
    const trimmed = base.replace(/\/+$/, '');
    const hasRest = /\/rest\/v1$/.test(trimmed);
    return `${trimmed}${hasRest ? '' : '/rest/v1'}${path.startsWith('/') ? path : '/' + path}`;
}

async function supaRequest(method, path, body) {
    const creds = getCreds();
    if (!creds.ok) return { ok: false, skipped: true, reason: creds.reason };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

    try {
        const res = await fetch(buildUrl(creds.url, path), {
            method,
            headers: {
                'apikey': creds.key,
                'Authorization': `Bearer ${creds.key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return { ok: res.ok, status: res.status, data };
    } catch (error) {
        return { ok: false, error: error.message };
    } finally {
        clearTimeout(timer);
    }
}

async function updateRegistroFecha(appointmentId, isoStartTime) {
    return supaRequest('PATCH', `/registros?id=eq.${encodeURIComponent(appointmentId)}`, {
        fecha_turno: isoStartTime
    });
}

async function cancelarRegistro(appointmentId) {
    return supaRequest('PATCH', `/registros?id=eq.${encodeURIComponent(appointmentId)}`, {
        estado: 'cancelado'
    });
}

module.exports = { updateRegistroFecha, cancelarRegistro, supaRequest };
