function validateAgendamiento(body) {
    const errors = [];

    if (!body || typeof body !== 'object') {
        return { ok: false, errors: ['Payload inválido'] };
    }

    if (!body.first_name || typeof body.first_name !== 'string' || body.first_name.trim().length < 1 || body.first_name.trim().length > 60) {
        errors.push('first_name: requerido (1-60 chars)');
    }
    if (!body.last_name || typeof body.last_name !== 'string' || body.last_name.trim().length < 1 || body.last_name.trim().length > 60) {
        errors.push('last_name: requerido (1-60 chars)');
    }

    const phone = String(body.phone || '').replace(/[\s\-\+\(\)]/g, '');
    if (!phone || !/^\d{10,15}$/.test(phone)) {
        errors.push('phone: requerido, mínimo 10 dígitos (código área + número AR)');
    }

    const dni = String(body.DNI || '').replace(/\./g, '').trim();
    if (!dni || !/^\d{7,8}$/.test(dni)) {
        errors.push('DNI: requerido, 7 u 8 dígitos numéricos');
    } else if (/^(\d)\1+$/.test(dni)) {
        errors.push('DNI: valor inválido');
    }

    if (body['Obra Social'] !== undefined && typeof body['Obra Social'] !== 'string') {
        errors.push('Obra Social: debe ser string');
    }

    if (!body.Tratamiento || typeof body.Tratamiento !== 'string' || body.Tratamiento.trim().length < 1) {
        errors.push('Tratamiento: requerido');
    }

    const cal = body.calendar;
    if (!cal || typeof cal !== 'object') {
        errors.push('calendar: objeto requerido');
    } else {
        if (!cal.appointmentId || String(cal.appointmentId).trim() === '') {
            errors.push('calendar.appointmentId: requerido');
        }
        if (!cal.calendarName || String(cal.calendarName).trim() === '') {
            errors.push('calendar.calendarName: requerido');
        }
        if (!cal.startTime || isNaN(new Date(cal.startTime).getTime())) {
            errors.push('calendar.startTime: requerido, formato ISO 8601');
        }
    }

    return errors.length ? { ok: false, errors } : { ok: true };
}

module.exports = { validateAgendamiento };
