// =============================================
// CONFIGURACIÓN
// =============================================
let SUPABASE_URL = '';
let SUPABASE_HEADERS = {};
const GHL_LOC = 'fotG33HIQ58UyWeEbpx9';
const TZ = 'America/Argentina/Buenos_Aires';

async function initConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('config endpoint failed');
        const cfg = await res.json();
        SUPABASE_URL = cfg.SUPABASE_URL || '';
        const key = cfg.SUPABASE_ANON_KEY || '';
        SUPABASE_HEADERS = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
    } catch (_) {
        console.warn('[Config] No se pudo cargar configuración del servidor');
    }
}

// =============================================
// ESTADO GLOBAL
// =============================================
let disponibilidadGlobal = {};
let slotSeleccionado = null;
let bookingMode = 'especialidad'; // 'especialidad' | 'profesional'
let profesionalesCache = []; // cache de profesionales de Supabase

// =============================================
// TRATAMIENTOS POR ESPECIALIDAD
// =============================================
const TRATAMIENTOS = {
    'odontología general':  ['Consulta / Revisación general', 'Limpieza y profilaxis', 'Urgencia odontológica', 'Extracción simple', 'Obturación (caries)', 'Selladores preventivos', 'Fluoruración'],
    'odontologia general':  ['Consulta / Revisación general', 'Limpieza y profilaxis', 'Urgencia odontológica', 'Extracción simple', 'Obturación (caries)', 'Selladores preventivos', 'Fluoruración'],
    'general':              ['Consulta / Revisación general', 'Limpieza y profilaxis', 'Urgencia odontológica', 'Extracción simple', 'Obturación (caries)', 'Selladores preventivos', 'Fluoruración'],
    'ortodoncia':           ['Consulta inicial de ortodoncia', 'Colocación de brackets', 'Control de brackets', 'Ortodoncia invisible (Invisalign)', 'Retención post-tratamiento'],
    'implantología':        ['Consulta de implantes', 'Colocación de implante', 'Control post-operatorio', 'Corona sobre implante'],
    'implantologia':        ['Consulta de implantes', 'Colocación de implante', 'Control post-operatorio', 'Corona sobre implante'],
    'endodoncia':           ['Tratamiento de conductos', 'Retratamiento de conductos', 'Urgencia endodóntica'],
    'periodoncia':          ['Raspaje y alisado radicular', 'Tratamiento de encías', 'Cirugía periodontal', 'Control periodontal'],
    'estética dental':      ['Blanqueamiento dental', 'Carillas de porcelana', 'Composite estético', 'Diseño de sonrisa'],
    'estetica dental':      ['Blanqueamiento dental', 'Carillas de porcelana', 'Composite estético', 'Diseño de sonrisa'],
    'estética':             ['Blanqueamiento dental', 'Carillas de porcelana', 'Composite estético', 'Diseño de sonrisa'],
    'estetica':             ['Blanqueamiento dental', 'Carillas de porcelana', 'Composite estético', 'Diseño de sonrisa'],
    'cirugía':              ['Extracción de muela del juicio', 'Cirugía de tejidos blandos', 'Frenectomía'],
    'cirugia':              ['Extracción de muela del juicio', 'Cirugía de tejidos blandos', 'Frenectomía'],
    'odontopediatría':      ['Control pediátrico', 'Urgencia pediátrica', 'Selladores preventivos (niños)', 'Fluoruración infantil', 'Aparatología removible'],
    'odontopediatria':      ['Control pediátrico', 'Urgencia pediátrica', 'Selladores preventivos (niños)', 'Fluoruración infantil', 'Aparatología removible'],
    'pediátrico':           ['Control pediátrico', 'Urgencia pediátrica', 'Selladores preventivos (niños)', 'Fluoruración infantil'],
    'pediatrico':           ['Control pediátrico', 'Urgencia pediátrica', 'Selladores preventivos (niños)', 'Fluoruración infantil'],
    'prótesis':             ['Consulta de prótesis', 'Prótesis fija', 'Prótesis removible', 'Prótesis total', 'Control de prótesis'],
    'protesis':             ['Consulta de prótesis', 'Prótesis fija', 'Prótesis removible', 'Prótesis total', 'Control de prótesis'],
    'radiología':           ['Radiografía periapical', 'Panorámica dental', 'Tomografía CBCT'],
    'radiologia':           ['Radiografía periapical', 'Panorámica dental', 'Tomografía CBCT'],
};
const TRATAMIENTOS_FALLBACK = ['Consulta general', 'Control / Revisación', 'Urgencia', 'Otro'];

function getTratamientosPorEspecialidad(esp) {
    if (!esp) return TRATAMIENTOS_FALLBACK;
    const lower = esp.toLowerCase().trim();
    if (TRATAMIENTOS[lower]) return TRATAMIENTOS[lower];
    // buscar si la especialidad contiene alguna clave o viceversa
    for (const key of Object.keys(TRATAMIENTOS)) {
        if (lower.includes(key) || key.includes(lower)) return TRATAMIENTOS[key];
    }
    return TRATAMIENTOS_FALLBACK;
}

function actualizarTratamientos(especialidad) {
    const sel = document.getElementById('tratamiento');
    if (!sel) return;
    const lista = getTratamientosPorEspecialidad(especialidad);
    sel.innerHTML = '<option value="">Seleccioná el tratamiento</option>';
    lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
    });
}

// =============================================
// MODO DE AGENDAMIENTO
// =============================================
function setBookingMode(mode) {
    bookingMode = mode;

    document.getElementById('btnModeEsp').classList.toggle('active', mode === 'especialidad');
    document.getElementById('btnModeProf').classList.toggle('active', mode === 'profesional');

    const step1Esp = document.getElementById('step1-especialidad');
    const step1Prof = document.getElementById('step1-profesional');

    if (mode === 'especialidad') {
        step1Esp.style.display = '';
        step1Prof.style.display = 'none';
    } else {
        step1Esp.style.display = 'none';
        step1Prof.style.display = '';
        cargarProfesionalesSelect();
    }

    // Resetear form
    resetBookingForm();
}

function resetBookingForm() {
    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('agendarFormContainer').style.display = 'none';
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';
    document.getElementById('datePickerContainer').innerHTML = '<p class="placeholder-text">Cargando agenda...</p>';
    document.getElementById('tratamiento').innerHTML = '<option value="">Seleccioná primero una especialidad</option>';
}

// =============================================
// TABS
// =============================================
function selectTab(tab) {
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.nav-button[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
}

// =============================================
// UTILIDADES
// =============================================
function cerrarModal(id) {
    document.getElementById(id)?.classList.remove('active');
    if (id === 'successModal') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollDates(dir) {
    const c = document.getElementById('datePickerContainer');
    if (c) c.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
}

function scrollRescheduleDates(dir) {
    const c = document.getElementById('rescheduleDatePicker');
    if (c) c.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
}

async function supaFetch(path) {
    const url = `${SUPABASE_URL}${path}`;
    const res = await fetch(url, { headers: SUPABASE_HEADERS });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.hint || data.details || `Error ${res.status}`);
    return data;
}

async function ghlFetch(path, opts = {}) {
    const PROXY_URL = '/api/ghl?path=';
    const [basePath, queryStr] = path.split('?');
    const finalUrl = `${PROXY_URL}${encodeURIComponent(basePath)}${queryStr ? '&' + queryStr : ''}`;
    const res = await fetch(finalUrl, {
        ...opts,
        headers: { ...opts.headers, 'Content-Type': 'application/json' }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.msg || `GHL Error ${res.status}`);
    return json;
}

// =============================================
// 1A. CARGAR ESPECIALIDADES (desde Supabase)
// =============================================
async function cargarEspecialidades() {
    const select = document.getElementById('especialidadSelect');
    try {
        const data = await supaFetch('/profesionales?select=especialidades');
        const espSet = new Set();
        data.forEach(row => {
            (row.especialidades || '').split(',').forEach(s => {
                const clean = s.replace(/^-\s*/, '').trim().toLowerCase();
                if (clean && clean.length > 2) espSet.add(clean);
            });
        });
        const sorted = [...espSet].sort();
        select.innerHTML = '<option value="">Seleccioná una especialidad</option>';
        sorted.forEach(e => {
            const label = e.charAt(0).toUpperCase() + e.slice(1);
            const opt = document.createElement('option');
            opt.value = e;
            opt.textContent = label;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option value="">Error al cargar especialidades</option>';
    }
}

// =============================================
// 1B. CARGAR PROFESIONALES (desde Supabase)
// =============================================
async function cargarProfesionalesSelect() {
    const container = document.getElementById('profGridContainer');
    if (profesionalesCache.length) {
        poblarSelectProfesionales();
        return;
    }
    if (container) container.innerHTML = '<p class="placeholder-text" style="text-align:center;padding:1.5rem;">Cargando profesionales...</p>';
    try {
        const data = await supaFetch('/profesionales?select=*&order=profesional.asc');
        profesionalesCache = data;
        poblarSelectProfesionales();
    } catch (e) {
        console.error(e);
        if (container) container.innerHTML = '<p class="placeholder-text" style="text-align:center;color:var(--danger);">Error al cargar profesionales.</p>';
    }
}

function poblarSelectProfesionales() {
    const container = document.getElementById('profGridContainer');
    if (!container) return;

    if (!profesionalesCache.length) {
        container.innerHTML = '<p class="placeholder-text" style="text-align:center;padding:1.5rem;">No hay profesionales disponibles.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'prof-grid';

    profesionalesCache.forEach(prof => {
        const card = document.createElement('div');
        card.className = 'prof-card';
        card.dataset.calendarId = prof.calendar_id;
        card.innerHTML = `
            <div class="prof-card-name">${prof.profesional}</div>
            ${prof.sede ? `<span class="prof-card-badge">Sede: ${prof.sede}</span>` : ''}
        `;
        card.onclick = () => {
            document.querySelectorAll('.prof-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            onProfesionalCardSelected(prof);
        };
        grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);
}

// =============================================
// HANDLERS DE SELECCIÓN
// =============================================
function onEspecialidadChange() {
    const especialidad = document.getElementById('especialidadSelect').value;
    actualizarTratamientos(especialidad);
    cargarSlotsEspecialidad(especialidad);
}

function onProfesionalChange() {
    const calendarId = document.getElementById('profesionalSelect')?.value;
    if (!calendarId) { resetBookingForm(); return; }
    const prof = profesionalesCache.find(p => p.calendar_id === calendarId);
    onProfesionalCardSelected(prof || { calendar_id: calendarId });
}

function onProfesionalCardSelected(prof) {
    const primeraEsp = (prof.especialidades || '').split(',')[0].replace(/^-\s*/, '').trim().toLowerCase();
    actualizarTratamientos(primeraEsp || '');
    cargarSlotsCalendar(prof.calendar_id);
}

// =============================================
// 2A. CARGAR SLOTS POR ESPECIALIDAD
// =============================================
async function cargarSlotsEspecialidad(especialidad) {
    const formContainer = document.getElementById('agendarFormContainer');
    const dateContainer = document.getElementById('datePickerContainer');

    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';

    if (!especialidad) {
        formContainer.style.display = 'none';
        return;
    }

    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Buscando turnos disponibles...</p>';

    try {
        const profs = await supaFetch(`/profesionales?select=*&especialidades=ilike.*${encodeURIComponent(especialidad)}*`);

        if (!profs.length) {
            dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay profesionales para esta especialidad.</p>';
            return;
        }

        const now = Date.now();
        const end = now + 30 * 24 * 60 * 60 * 1000;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const results = await Promise.all(profs.map(async prof => {
            try {
                const raw = await ghlFetch(`calendars/${prof.calendar_id}/free-slots?startDate=${now}&endDate=${end}&timezone=${encodeURIComponent(tz)}`);
                return parsearSlots(raw, prof);
            } catch { return []; }
        }));

        poblarDisponibilidad(results.flat());
        dibujarTarjetasDeDias(dateContainer);
    } catch (e) {
        dateContainer.innerHTML = `<p style="color:var(--danger);margin:auto;">Error: ${e.message}</p>`;
    }
}

// =============================================
// 2B. CARGAR SLOTS POR CALENDAR ID (profesional)
// =============================================
async function cargarSlotsCalendar(calendarId) {
    const formContainer = document.getElementById('agendarFormContainer');
    const dateContainer = document.getElementById('datePickerContainer');

    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';

    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Buscando turnos disponibles...</p>';

    try {
        const prof = profesionalesCache.find(p => p.calendar_id === calendarId);
        const now = Date.now();
        const end = now + 30 * 24 * 60 * 60 * 1000;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const raw = await ghlFetch(`calendars/${calendarId}/free-slots?startDate=${now}&endDate=${end}&timezone=${encodeURIComponent(tz)}`);
        const slots = parsearSlots(raw, prof || { calendar_id: calendarId, profesional: 'Profesional', sede: '' });
        poblarDisponibilidad([slots]);
        dibujarTarjetasDeDias(dateContainer);
    } catch (e) {
        dateContainer.innerHTML = `<p style="color:var(--danger);margin:auto;">Error: ${e.message}</p>`;
    }
}

// =============================================
// HELPERS DE SLOTS
// =============================================
function parsearSlots(raw, prof) {
    const slotsMap = raw?.slots || raw?.data || raw || {};
    const collected = [];
    Object.entries(slotsMap).forEach(([dateStr, dayData]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        const slots = dayData?.slots || dayData;
        if (!Array.isArray(slots)) return;
        slots.forEach(slot => {
            const iso = typeof slot === 'string' ? slot : (slot.startTime || slot);
            const d = new Date(iso);
            if (!isNaN(d.getTime()) && d > new Date()) {
                collected.push({
                    iso, d, dateStr,
                    profesional: prof.profesional,
                    sede: prof.sede,
                    calendarId: prof.calendar_id,
                    calendarName: `${prof.profesional} - ${prof.sede}`
                });
            }
        });
    });
    return collected;
}

function poblarDisponibilidad(allSlotsArrays) {
    const allSlots = allSlotsArrays.flat().sort((a, b) => a.d - b.d);
    disponibilidadGlobal = {};
    allSlots.forEach(slot => {
        if (!disponibilidadGlobal[slot.dateStr]) disponibilidadGlobal[slot.dateStr] = [];
        const exists = disponibilidadGlobal[slot.dateStr].find(s => s.iso === slot.iso && s.calendarId === slot.calendarId);
        if (!exists) disponibilidadGlobal[slot.dateStr].push(slot);
    });
}

function dibujarTarjetasDeDias(container) {
    container.innerHTML = '';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const fechas = Object.keys(disponibilidadGlobal).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    let hayDias = false;

    fechas.forEach(dateStr => {
        const slots = disponibilidadGlobal[dateStr];
        if (!slots || !slots.length) return;
        hayDias = true;
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, d);
        const card = document.createElement('div');
        card.className = 'date-card has-slots';
        card.dataset.date = dateStr;
        card.onclick = () => seleccionarFecha(dateStr, card);
        card.innerHTML = `<span class="day-name">${days[dateObj.getDay()]}</span><span class="day-number">${d}</span><span class="month-year">${months[dateObj.getMonth()]}</span>`;
        container.appendChild(card);
    });

    if (!hayDias) container.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay días disponibles en los próximos 30 días.</p>';
}

// =============================================
// 3. SELECCIONAR FECHA Y HORARIOS
// =============================================
function seleccionarFecha(dateStr, cardEl) {
    document.getElementById('appointmentDate').value = dateStr;
    document.getElementById('appointmentTime').value = '';
    slotSeleccionado = null;
    document.querySelectorAll('#datePickerContainer .date-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    const slotsData = disponibilidadGlobal[dateStr] || [];
    const container = document.getElementById('timeSlotsContainer');
    container.innerHTML = '';

    if (!slotsData.length) {
        container.innerHTML = '<p class="placeholder-text">No hay horarios para esta fecha.</p>';
        return;
    }

    const seen = new Set();
    const parsed = slotsData
        .filter(slot => {
            if (seen.has(slot.iso)) return false;
            seen.add(slot.iso);
            return true;
        })
        .sort((a, b) => a.d - b.d);

    parsed.forEach(slot => {
        const hh = String(slot.d.getHours()).padStart(2, '0');
        const mm = String(slot.d.getMinutes()).padStart(2, '0');
        const btn = document.createElement('div');
        btn.className = 'time-slot-btn';
        btn.textContent = `${hh}:${mm}`;
        btn.onclick = () => {
            container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('appointmentTime').value = slot.iso;
            slotSeleccionado = slot;
        };
        container.appendChild(btn);
    });
}

// =============================================
// 4. AGENDAR TURNO
// =============================================
document.getElementById('agendarForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const status = document.getElementById('agendarStatus');
    const submitBtn = document.getElementById('submitBtn');

    const nombre    = document.getElementById('nombre').value.trim();
    const apellido  = document.getElementById('apellido').value.trim();
    const dni       = document.getElementById('dni').value.trim();
    const telRaw    = document.getElementById('telefono').value.replace(/\D/g, '');
    const telefono  = '549' + telRaw;
    const obraSocial = document.getElementById('obraSocial')?.value || '';
    const tratamiento = document.getElementById('tratamiento').value.trim();
    const startTime = document.getElementById('appointmentTime').value;

    // Validaciones
    if (!nombre || !apellido || !dni || !telRaw) {
        setStatus(status, '⚠️ Completá todos los campos obligatorios.');
        return;
    }
    if (!/^\d{7,8}$/.test(dni)) {
        setStatus(status, '⚠️ El DNI debe tener 7 u 8 dígitos numéricos.');
        return;
    }
    if (!/^\d{10}$/.test(telRaw)) {
        setStatus(status, '⚠️ El teléfono debe tener 10 dígitos (sin el 549).');
        return;
    }
    if (!tratamiento) {
        setStatus(status, '⚠️ Seleccioná el tratamiento.');
        return;
    }
    if (!startTime || !slotSeleccionado) {
        setStatus(status, '⚠️ Seleccioná fecha y horario.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';
    status.textContent = '';

    let appointmentId = null;

    try {
        // 1. Buscar o crear contacto en GHL
        let contactId;
        try {
            const search = await ghlFetch(`contacts/search/duplicate?locationId=${GHL_LOC}&number=${encodeURIComponent(telefono)}`);
            contactId = search?.contact?.id;
        } catch (_) { /* no encontrado */ }

        if (!contactId) {
            const created = await ghlFetch('contacts/', {
                method: 'POST',
                body: JSON.stringify({
                    locationId: GHL_LOC,
                    firstName: nombre,
                    lastName: apellido,
                    phone: telefono,
                    tags: ['web-agendamiento'],
                    customFields: [
                        { key: 'DNI', field_value: dni },
                        { key: 'Tratamiento', field_value: tratamiento }
                    ]
                })
            });
            contactId = created?.contact?.id;
        }

        if (!contactId) throw new Error('No se pudo crear el contacto.');

        // 2. Crear cita en GHL
        const appointmentRes = await ghlFetch('calendars/events/appointments', {
            method: 'POST',
            body: JSON.stringify({
                calendarId: slotSeleccionado.calendarId,
                locationId: GHL_LOC,
                contactId,
                startTime,
                title: `${nombre} ${apellido}${obraSocial ? ' - ' + obraSocial : ''} - ${tratamiento}`,
                appointmentStatus: 'confirmed'
            })
        });
        appointmentId = appointmentRes?.appointment?.id || appointmentRes?.id;
        if (!appointmentId) throw new Error('GHL no devolvió el ID del turno.');

        // 3. Notificar al workflow n8n
        const webhookRes = await fetch('/api/webhook-agendamiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                first_name: nombre,
                last_name: apellido,
                full_name: `${nombre} ${apellido}`,
                phone: telefono,
                DNI: dni,
                'Obra Social': obraSocial,
                Tratamiento: tratamiento,
                calendar: {
                    appointmentId,
                    calendarName: slotSeleccionado.calendarName,
                    startTime,
                    last_updated_by_meta: { source: 'Web Agendamiento' }
                }
            })
        });

        if (!webhookRes.ok) {
            await ghlFetch(`calendars/events/appointments/${appointmentId}`, {
                method: 'PUT',
                body: JSON.stringify({ appointmentStatus: 'cancelled' })
            }).catch(() => {});
            throw new Error('No se pudo registrar el turno. Por favor reintentá en unos minutos.');
        }

        document.getElementById('successModal')?.classList.add('active');
        document.getElementById('agendarForm').reset();
        document.getElementById('agendarFormContainer').style.display = 'none';
        document.getElementById('especialidadSelect').value = '';
        document.getElementById('profesionalSelect').value = '';
        disponibilidadGlobal = {};
        slotSeleccionado = null;
    } catch (e) {
        setStatus(status, `❌ ${e.message || 'Error al agendar.'}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Turno';
    }
});

function setStatus(el, msg, color) {
    el.textContent = msg;
    el.style.color = color || 'var(--danger)';
}

// =============================================
// 5. BUSCAR MIS TURNOS POR DNI (Supabase)
// =============================================
async function buscarMisTurnos() {
    const sede = document.getElementById('consultaSede').value;
    const dni = document.getElementById('consultaDNI').value.trim();
    const container = document.getElementById('resultadoTurnos');

    if (!sede) { container.innerHTML = '<p style="color:var(--danger);text-align:center;">Seleccioná una sede.</p>'; return; }
    if (!dni)  { container.innerHTML = '<p style="color:var(--danger);text-align:center;">Ingresá tu DNI.</p>'; return; }

    container.innerHTML = '<p class="loading-spinner" style="text-align:center;padding:2rem;">Buscando turnos...</p>';

    try {
        const ahora = new Date();
        const hoyArg = new Date(ahora.toLocaleString('en-US', { timeZone: TZ }));
        hoyArg.setHours(0, 0, 0, 0);

        let turnosPorDni = await supaFetch(
            `/registros?select=*&dni=eq.${encodeURIComponent(dni)}&sede=eq.${sede}&order=fecha_turno.asc&limit=100`
        ).catch(() => []);

        const personas = await supaFetch(`/personas?select=telefono,nombre&dni=eq.${encodeURIComponent(dni)}&limit=5`).catch(() => []);

        const telefonos = new Set();
        if (personas && personas.length) {
            personas.forEach(p => {
                const raw = String(p.telefono || '').replace(/\D/g, '');
                if (!raw) return;
                telefonos.add(raw);
                telefonos.add('+' + raw);
                if (raw.startsWith('549')) {
                    telefonos.add(raw.slice(3));
                    telefonos.add(raw.slice(2));
                    telefonos.add('+' + raw.slice(3));
                } else if (raw.startsWith('54')) {
                    telefonos.add(raw.slice(2));
                    telefonos.add('+' + raw.slice(2));
                } else {
                    telefonos.add('54' + raw);
                    telefonos.add('549' + raw);
                    telefonos.add('+54' + raw);
                    telefonos.add('+549' + raw);
                }
            });
        }

        let turnosPorTel = [];
        for (const tel of telefonos) {
            const res = await supaFetch(
                `/registros?select=*&numero=eq.${tel}&sede=eq.${sede}&order=fecha_turno.asc&limit=100`
            ).catch(() => []);
            if (res && res.length) turnosPorTel = [...turnosPorTel, ...res];
        }

        let turnos = [...turnosPorDni, ...turnosPorTel];
        const vistos = new Set();
        turnos = turnos.filter(t => {
            const key = t.id ? t.id.toString() : (t.event_id || JSON.stringify(t));
            if (vistos.has(key)) return false;
            vistos.add(key);
            return true;
        });

        turnos = turnos.filter(t => {
            const raw = t.fecha_turno || t.fecha || '';
            if (!raw) return false;
            let d;
            if (raw.includes('/')) {
                const parts = raw.split(/[/\s:-]/);
                d = parts.length >= 3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`) : new Date(raw);
            } else {
                d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
            }
            if (isNaN(d.getTime())) return true;
            return d >= hoyArg;
        });

        if (!turnos.length) {
            container.innerHTML = '<div class="no-results">No hay turnos próximos para este DNI en la sede seleccionada.</div>';
            return;
        }

        container.innerHTML = turnos.map(t => {
            const raw = t.fecha_turno || t.fecha || '';
            const start = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
            const fechaStr = start.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
            const horaStr = raw.includes('T') ? start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : (t.hora || '');
            const eventId = t.event_id || t.eventId || t.id || '';
            const rawStatus = (t.estado || t.status || 'agendado').toLowerCase();
            const isCancelled = rawStatus === 'cancelado' || rawStatus === 'cancelled';

            const statusMap = {
                agendado: { label: 'Confirmado', cls: 'status-confirmed' },
                confirmado: { label: 'Confirmado', cls: 'status-confirmed' },
                booked: { label: 'Confirmado', cls: 'status-confirmed' },
                cancelado: { label: 'Cancelado', cls: 'status-cancelled' },
                cancelled: { label: 'Cancelado', cls: 'status-cancelled' },
                pendiente: { label: 'Pendiente', cls: 'status-pending' }
            };
            const st = statusMap[rawStatus] || { label: rawStatus, cls: 'status-pending' };
            const sedeEscapada = (t.sede || '').replace(/'/g, '');
            const profEscapado = (t.profesional || '').replace(/'/g, '');

            return `
                <div class="turno-card">
                    <div class="turno-header">
                        <span class="turno-fecha">${fechaStr}</span>
                        ${horaStr ? `<span class="turno-hora">${horaStr}</span>` : ''}
                    </div>
                    <div class="turno-info">
                        <div><div class="turno-info-label">Paciente</div><div>${t.nombre || 'N/A'}</div></div>
                        <div><div class="turno-info-label">Profesional</div><div>${t.profesional || 'N/A'}</div></div>
                        <div><div class="turno-info-label">Sede</div><div>${t.sede || sede}</div></div>
                        <div><div class="turno-info-label">Tratamiento</div><div>${t.tratamiento || t.motivo || 'N/A'}</div></div>
                        <div><div class="turno-info-label">Estado</div><span class="status-badge ${st.cls}">${st.label}</span></div>
                    </div>
                    ${!isCancelled && eventId ? `
                    <div class="turno-actions">
                        <button class="btn-reagendar" onclick="abrirReagendamiento('${eventId}', '${profEscapado}', '${sedeEscapada}')">Reagendar</button>
                        <button class="btn-cancelar" onclick="cancelarTurno('${eventId}')">Cancelar</button>
                    </div>` : ''}
                </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="no-results" style="color:var(--danger);">Error: ${e.message}</div>`;
    }
}

// =============================================
// 6. CANCELAR TURNO
// =============================================
async function cancelarTurno(appointmentId) {
    if (!confirm('¿Estás seguro de que querés cancelar este turno?')) return;
    try {
        await ghlFetch(`calendars/events/appointments/${appointmentId}`, {
            method: 'PUT',
            body: JSON.stringify({ appointmentStatus: 'cancelled' })
        });
        alert('Turno cancelado correctamente.');
        buscarMisTurnos();
    } catch (e) {
        alert('Error al cancelar: ' + (e.message || 'Intentá de nuevo.'));
    }
}

// =============================================
// 7. REAGENDAR TURNO
// =============================================
async function abrirReagendamiento(appointmentId, profesionalName, sede) {
    document.getElementById('rescheduleAppointmentId').value = appointmentId;
    document.getElementById('rescheduleDate').value = '';
    document.getElementById('rescheduleTime').value = '';
    document.getElementById('rescheduleTimeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha.</p>';
    document.getElementById('rescheduleStatus').textContent = '';
    document.getElementById('rescheduleModal').classList.add('active');

    const container = document.getElementById('rescheduleDatePicker');
    container.innerHTML = '<p class="placeholder-text" style="margin:auto;">Cargando agenda...</p>';

    try {
        let calendarId = '';

        if (profesionalName) {
            const nombreBase = profesionalName.split(' - ')[0].trim();
            const profs = await supaFetch(`/profesionales?select=calendar_id&profesional=ilike.*${encodeURIComponent(nombreBase)}*&limit=1`).catch(() => []);
            if (profs.length) calendarId = profs[0].calendar_id;
        }

        if (!calendarId && sede) {
            const profsBySede = await supaFetch(`/profesionales?select=calendar_id&sede=ilike.*${encodeURIComponent(sede)}*&limit=1`).catch(() => []);
            if (profsBySede.length) calendarId = profsBySede[0].calendar_id;
        }

        document.getElementById('rescheduleCalendarId').value = calendarId;

        if (!calendarId) {
            container.innerHTML = '<p style="color:var(--warning);margin:auto;">No se encontró el calendario del profesional.</p>';
            return;
        }

        const now = Date.now();
        const end = now + 60 * 24 * 60 * 60 * 1000;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data = await ghlFetch(`calendars/${calendarId}/free-slots?startDate=${now}&endDate=${end}&timezone=${encodeURIComponent(tz)}`);
        const slotsMap = data?.slots || data?.data || data || {};

        container.innerHTML = '';
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const fechas = Object.keys(slotsMap).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        let hayDias = false;

        fechas.forEach(dateStr => {
            const slots = slotsMap[dateStr]?.slots || slotsMap[dateStr];
            if (!Array.isArray(slots) || !slots.length) return;
            hayDias = true;
            const [y, m, d] = dateStr.split('-');
            const dateObj = new Date(y, m - 1, d);
            const card = document.createElement('div');
            card.className = 'date-card has-slots';
            card.onclick = () => seleccionarFechaReagendar(dateStr, card, slotsMap);
            card.innerHTML = `<span class="day-name">${days[dateObj.getDay()]}</span><span class="day-number">${d}</span><span class="month-year">${months[dateObj.getMonth()]}</span>`;
            container.appendChild(card);
        });

        if (!hayDias) container.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay días disponibles.</p>';
    } catch (e) {
        container.innerHTML = '<p style="color:red;margin:auto;">Error al cargar agenda.</p>';
    }
}

function seleccionarFechaReagendar(dateStr, cardEl, avail) {
    document.getElementById('rescheduleDate').value = dateStr;
    document.getElementById('rescheduleTime').value = '';
    document.querySelectorAll('#rescheduleDatePicker .date-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    const slotsData = avail[dateStr]?.slots || avail[dateStr];
    const container = document.getElementById('rescheduleTimeSlotsContainer');
    container.innerHTML = '';
    if (!Array.isArray(slotsData) || !slotsData.length) {
        container.innerHTML = '<p class="placeholder-text">No hay horarios.</p>';
        return;
    }

    const parsed = [];
    slotsData.forEach(slot => {
        const d = new Date(typeof slot === 'string' ? slot : (slot.startTime || slot));
        if (isNaN(d.getTime())) return;
        const tv = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (!parsed.find(s => s.tv === tv)) parsed.push({ tv, iso: typeof slot === 'string' ? slot : (slot.startTime || slot), d });
    });
    parsed.sort((a, b) => a.d - b.d);

    parsed.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'time-slot-btn';
        btn.textContent = s.tv;
        btn.onclick = () => {
            container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('rescheduleTime').value = s.iso;
        };
        container.appendChild(btn);
    });
}

async function confirmarReagendamiento() {
    const appointmentId = document.getElementById('rescheduleAppointmentId').value;
    const startTime = document.getElementById('rescheduleTime').value;
    const status = document.getElementById('rescheduleStatus');

    if (!startTime) { status.textContent = '⚠️ Seleccioná fecha y horario.'; status.style.color = 'var(--danger)'; return; }

    status.textContent = 'Reagendando...';
    status.style.color = 'var(--primary)';

    try {
        await ghlFetch(`calendars/events/appointments/${appointmentId}`, {
            method: 'PUT',
            body: JSON.stringify({ startTime })
        });
        cerrarModal('rescheduleModal');
        alert('Turno reagendado correctamente.');
        buscarMisTurnos();
    } catch (e) {
        status.textContent = `❌ ${e.message || 'Error al reagendar.'}`;
        status.style.color = 'var(--danger)';
    }
}

// =============================================
// LOOKUP PACIENTE POR DNI
// =============================================
async function buscarPacientePorDni(dni) {
    const statusEl = document.getElementById('dniLookupStatus');
    if (!/^\d{7,8}$/.test(dni)) { statusEl.textContent = ''; return; }

    statusEl.textContent = 'Buscando...';
    try {
        const data = await supaFetch(`/personas?select=nombre,telefono,obra_social&dni=eq.${encodeURIComponent(dni)}&limit=1`);
        if (!data.length) { statusEl.textContent = ''; return; }

        const p = data[0];
        const fullName = (p.nombre || '').trim();
        const parts = fullName.split(' ');
        if (parts.length >= 2) {
            document.getElementById('nombre').value = parts.slice(0, -1).join(' ');
            document.getElementById('apellido').value = parts[parts.length - 1];
        } else {
            document.getElementById('nombre').value = fullName;
        }

        if (p.telefono) {
            let tel = String(p.telefono).replace(/\D/g, '');
            if (tel.startsWith('549')) tel = tel.slice(3);
            else if (tel.startsWith('54')) tel = tel.slice(2);
            document.getElementById('telefono').value = tel.slice(0, 10);
        }

        if (p.obra_social) {
            const sel = document.getElementById('obraSocial');
            const match = [...sel.options].find(o => o.value.toLowerCase() === p.obra_social.toLowerCase());
            if (match) sel.value = match.value;
            else { sel.value = 'Otra'; }
        }

        statusEl.textContent = '✓ Datos encontrados';
        statusEl.style.color = 'var(--success)';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (_) {
        statusEl.textContent = '';
    }
}

// =============================================
// INPUT FILTERS — robusto
// =============================================

// DNI: solo dígitos, máximo 8
function enforceDni(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);
    if (input.value !== val) input.value = val;
}

// Teléfono: solo dígitos, máximo 10
function enforceTelefono(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    if (input.value !== val) input.value = val;
}

// DNI principal
const dniInput = document.getElementById('dni');
if (dniInput) {
    dniInput.addEventListener('input', () => enforceDni(dniInput));
    dniInput.addEventListener('keydown', e => {
        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
        if (!allowed.includes(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }
    });
    dniInput.addEventListener('blur', () => buscarPacientePorDni(dniInput.value.trim()));
}

// DNI consulta turnos
const consultaDNI = document.getElementById('consultaDNI');
if (consultaDNI) {
    consultaDNI.addEventListener('input', () => enforceDni(consultaDNI));
    consultaDNI.addEventListener('keydown', e => {
        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
        if (!allowed.includes(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }
    });
    consultaDNI.addEventListener('keypress', e => { if (e.key === 'Enter') buscarMisTurnos(); });
}

// Teléfono
const telInput = document.getElementById('telefono');
if (telInput) {
    telInput.addEventListener('input', () => enforceTelefono(telInput));
    telInput.addEventListener('keydown', e => {
        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
        if (!allowed.includes(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }
    });
    telInput.addEventListener('paste', e => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        // si pegaron con el prefijo, quitarlo
        let clean = pasted;
        if (clean.startsWith('549')) clean = clean.slice(3);
        else if (clean.startsWith('54')) clean = clean.slice(2);
        telInput.value = clean.slice(0, 10);
    });
}

// =============================================
// INIT
// =============================================
initConfig().then(() => {
    cargarEspecialidades();
});
