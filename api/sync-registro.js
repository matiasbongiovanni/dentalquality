const { notifyN8n } = require('./_lib/notifyN8n');
const { updateRegistroFecha, cancelarRegistro } = require('./_lib/supabaseAdmin');
const { isRateLimited, getClientIp } = require('./_lib/rateLimit');

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar').trim();

function validate(body) {
    const errors = [];
    if (!body || typeof body !== 'object') return { ok: false, errors: ['Payload inválido'] };

    if (!['reschedule', 'cancel'].includes(body.action)) {
        errors.push('action: debe ser "reschedule" o "cancel"');
    }
    if (!body.appointmentId || String(body.appointmentId).trim() === '') {
        errors.push('appointmentId: requerido');
    }
    if (body.action === 'reschedule') {
        if (!body.startTime || isNaN(new Date(body.startTime).getTime())) {
            errors.push('startTime: requerido (ISO 8601)');
        }
    }
    if (body.DNI !== undefined) {
        const dni = String(body.DNI).replace(/\./g, '').trim();
        if (dni && !/^\d{7,8}$/.test(dni)) {
            errors.push('DNI: 7 u 8 dígitos numéricos');
        }
    }
    return errors.length ? { ok: false, errors } : { ok: true };
}

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
    if (isRateLimited(ip, 20, 'sync')) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' });
    }

    const body = req.body || {};
    const validation = validate(body);
    if (!validation.ok) {
        return res.status(400).json({ error: 'Payload inválido', errors: validation.errors });
    }

    const { action, appointmentId, startTime } = body;
    const sourceTag = action === 'reschedule' ? 'Web Reagendamiento' : 'Web Cancelacion';

    // 1. Sync Supabase con service-role (autoritativo)
    let dbResult;
    if (action === 'reschedule') {
        dbResult = await updateRegistroFecha(appointmentId, startTime);
    } else {
        dbResult = await cancelarRegistro(appointmentId);
    }

    // 2. Notificar a n8n (best-effort, para dashboard / triggers downstream)
    const n8nPayload = {
        first_name: body.first_name || '',
        last_name: body.last_name || '',
        full_name: body.full_name || '',
        phone: body.phone || '',
        DNI: body.DNI || '',
        'Obra Social': body['Obra Social'] || '',
        Tratamiento: body.Tratamiento || '',
        calendar: {
            appointmentId,
            calendarName: body.calendarName || '',
            startTime: startTime || body.calendar?.startTime || null
        }
    };
    const n8nResult = await notifyN8n(n8nPayload, sourceTag);

    const dni = String(body.DNI || '').slice(0, 4) + '****';
    console.log(JSON.stringify({
        action,
        appointmentId,
        dni,
        dbOk: dbResult.ok,
        dbStatus: dbResult.status,
        dbSkipped: !!dbResult.skipped,
        dbError: dbResult.error || null,
        n8nOk: n8nResult.ok,
        n8nStatus: n8nResult.status,
        n8nSkipped: !!n8nResult.skipped
    }));

    // Si al menos uno de los dos canales sincronizó, consideramos éxito.
    // El cliente ya tiene confirmación de GHL — esto sólo refleja la sincronía interna.
    const syncedSomewhere = dbResult.ok || n8nResult.ok;

    if (!syncedSomewhere) {
        return res.status(207).json({
            ok: false,
            warning: 'GHL actualizado pero la sincronía interna falló. Se reintentará automáticamente.',
            db: { ok: false, skipped: dbResult.skipped || false, error: dbResult.error || null },
            n8n: { ok: false, skipped: n8nResult.skipped || false, error: n8nResult.error || null }
        });
    }

    res.status(200).json({
        ok: true,
        db: { ok: dbResult.ok, skipped: !!dbResult.skipped },
        n8n: { ok: n8nResult.ok, skipped: !!n8nResult.skipped }
    });
};
