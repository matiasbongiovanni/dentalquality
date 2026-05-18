// =============================================
// CONFIGURACIÓN
// =============================================
const SUPABASE_URL = 'https://devsupabase-dentalquality.surovianiasystems.site/rest/v1';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.FM9zFJ9Y0FsLT9pgW--ZnupLFMZ-CcRWOu6Q7IJv9d0';
const SUPABASE_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// Proxy local que evita CORS con GHL (correr: npm install && node proxy.js)
const GHL_PROXY = 'http://localhost:3001/ghl';
const GHL_LOC = 'fotG33HIQ58UyWeEbpx9';
const TZ = 'America/Argentina/Buenos_Aires';


// =============================================
// ESTADO GLOBAL
// =============================================
let profesionalesData = [];
let doctorSeleccionado = null;
let disponibilidadGlobal = {};

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
    console.log('[Supa] GET', url);
    const res = await fetch(url, { headers: SUPABASE_HEADERS });
    const data = await res.json();
    if (!res.ok) {
        console.error('[Supa] Error:', res.status, data);
        throw new Error(data.message || data.hint || data.details || `Error ${res.status}`);
    }
    return data;
}

async function ghlFetch(path, opts = {}) {
    // Para Vercel, usamos la Serverless Function local (en la carpeta api/)
    // Le pasamos el path de GHL como query parameter
    const PROXY_URL = '/api/ghl?path=';
    
    // Separar el path de los query params
    const [basePath, queryStr] = path.split('?');
    const finalUrl = `${PROXY_URL}${encodeURIComponent(basePath)}${queryStr ? '&' + queryStr : ''}`;
    
    console.log('[GHL] Llamando:', finalUrl);
    try {
        const res = await fetch(finalUrl, {
            ...opts,
            headers: {
                ...opts.headers,
                'Content-Type': 'application/json'
            }
        });
        const json = await res.json().catch(() => ({}));
        console.log('[GHL] Respuesta status:', res.status, json);
        if (!res.ok) {
            throw new Error(json.message || json.msg || `GHL Error ${res.status}`);
        }
        return json;
    } catch (err) {
        console.error('[GHL] Error de red:', err);
        throw err;
    }
}

// =============================================
// 1. CARGAR ESPECIALIDADES (desde Supabase)
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
        select.innerHTML = '<option value="">Selecciona una especialidad</option>';
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
// 2. CARGAR PROFESIONALES (desde Supabase)
// =============================================
async function cargarProfesionales() {
    const especialidad = document.getElementById('especialidadSelect').value;
    const container = document.getElementById('profesionalesContainer');
    const formContainer = document.getElementById('agendarFormContainer');
    doctorSeleccionado = null;
    formContainer.style.display = 'none';

    if (!especialidad) { container.style.display = 'none'; return; }

    container.style.display = 'grid';
    container.innerHTML = '<p class="loading-spinner" style="grid-column:1/-1;">Buscando profesionales...</p>';

    try {
        const data = await supaFetch(`/profesionales?select=*&especialidades=ilike.*${encodeURIComponent(especialidad)}*`);
        profesionalesData = data;

        if (!data.length) {
            container.innerHTML = '<p class="no-results" style="grid-column:1/-1;">No hay profesionales para esta especialidad.</p>';
            return;
        }
        container.innerHTML = '';
        data.forEach(prof => {
            const btn = document.createElement('div');
            btn.className = 'doctor-button';
            btn.innerHTML = `<div class="doctor-name">${prof.profesional}</div><div class="doctor-label">${prof.sede}</div>`;
            btn.onclick = () => seleccionarDoctor(prof, btn);
            container.appendChild(btn);
        });
    } catch (e) {
        container.innerHTML = '<p class="no-results" style="grid-column:1/-1;">Error al buscar profesionales.</p>';
    }
}

// =============================================
// 3. SELECCIONAR DOCTOR Y CARGAR DISPONIBILIDAD
// =============================================
function seleccionarDoctor(prof, btnEl) {
    doctorSeleccionado = prof;
    document.querySelectorAll('.doctor-button').forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');

    const formContainer = document.getElementById('agendarFormContainer');
    document.getElementById('agendarDoctorInfo').textContent = `👨‍⚕️ ${prof.profesional} — ${prof.sede}`;
    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Selecciona una fecha para ver horarios.</p>';
    cargarDisponibilidad();
}

// =============================================
// 4. CARGAR DISPONIBILIDAD (desde GHL)
// =============================================
async function cargarDisponibilidad() {
    const container = document.getElementById('datePickerContainer');
    container.innerHTML = '<p class="placeholder-text" style="margin:auto;">Cargando agenda...</p>';

    try {
        const calendarId = doctorSeleccionado.calendar_id;
        const now = Date.now();
        const end = now + 30 * 24 * 60 * 60 * 1000;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const raw = await ghlFetch(`calendars/${calendarId}/free-slots?startDate=${now}&endDate=${end}&timezone=${encodeURIComponent(tz)}`);
        console.log('[GHL] free-slots raw:', JSON.stringify(raw).substring(0, 500));

        // GHL puede devolver { slots: { 'YYYY-MM-DD': [...] } } o directamente { 'YYYY-MM-DD': {...} }
        if (raw && raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots)) {
            disponibilidadGlobal = raw.slots;
        } else if (raw && raw.data) {
            disponibilidadGlobal = raw.data;
        } else {
            disponibilidadGlobal = raw;
        }

        console.log('[GHL] disponibilidadGlobal keys:', Object.keys(disponibilidadGlobal).slice(0, 5));
        dibujarTarjetasDeDias(container);
    } catch (e) {
        console.error('Disponibilidad error:', e);
        container.innerHTML = `<p style="color:red;margin:auto;">Error: ${e.message}. Verifica que el proxy esté corriendo (node proxy.js)</p>`;
    }
}

function dibujarTarjetasDeDias(container) {
    container.innerHTML = '';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const fechas = Object.keys(disponibilidadGlobal).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    let hayDias = false;

    fechas.forEach(dateStr => {
        const slots = disponibilidadGlobal[dateStr]?.slots || disponibilidadGlobal[dateStr];
        if (!Array.isArray(slots) || slots.length === 0) return;
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

    if (!hayDias) container.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay días disponibles en los próximos 60 días.</p>';
}

// =============================================
// 5. SELECCIONAR FECHA Y HORARIOS
// =============================================
function seleccionarFecha(dateStr, cardEl) {
    document.getElementById('appointmentDate').value = dateStr;
    document.getElementById('appointmentTime').value = '';
    document.querySelectorAll('#datePickerContainer .date-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    const slotsData = disponibilidadGlobal[dateStr]?.slots || disponibilidadGlobal[dateStr];
    const container = document.getElementById('timeSlotsContainer');
    container.innerHTML = '';

    if (!Array.isArray(slotsData) || slotsData.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No hay horarios para esta fecha.</p>';
        return;
    }

    const parsed = [];
    slotsData.forEach(slot => {
        const d = new Date(typeof slot === 'string' ? slot : (slot.startTime || slot));
        if (isNaN(d.getTime())) return;
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const tv = `${hh}:${mm}`;
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
            document.getElementById('appointmentTime').value = s.iso;
        };
        container.appendChild(btn);
    });
}

// =============================================
// 6. AGENDAR TURNO (GHL API directo)
// =============================================
document.getElementById('agendarForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const status = document.getElementById('agendarStatus');
    const submitBtn = document.getElementById('submitBtn');

    const nombre = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const dni = document.getElementById('dni').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const motivo = document.getElementById('motivo').value.trim();
    const fecha = document.getElementById('appointmentDate').value;
    const startTime = document.getElementById('appointmentTime').value;

    if (!nombre || !apellido || !dni || !telefono) {
        status.textContent = '⚠️ Completá todos los campos obligatorios.';
        status.style.color = 'var(--danger)';
        return;
    }
    if (!/^\d+$/.test(dni)) {
        status.textContent = '⚠️ El DNI solo debe contener números.';
        status.style.color = 'var(--danger)';
        return;
    }
    if (!fecha || !startTime || !doctorSeleccionado) {
        status.textContent = '⚠️ Seleccioná fecha, horario y profesional.';
        status.style.color = 'var(--danger)';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';
    status.textContent = '';

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
                        { key: 'Tratamiento', field_value: motivo || 'Consulta' }
                    ]
                })
            });
            contactId = created?.contact?.id;
        }

        if (!contactId) throw new Error('No se pudo crear el contacto.');

        // 2. Crear cita en GHL
        await ghlFetch('calendars/events/appointments', {
            method: 'POST',
            body: JSON.stringify({
                calendarId: doctorSeleccionado.calendar_id,
                locationId: GHL_LOC,
                contactId,
                startTime,
                title: `${nombre} ${apellido} - ${motivo || 'Consulta'}`,
                appointmentStatus: 'confirmed'
            })
        });

        // GHL dispara el webhook a n8n automáticamente
        document.getElementById('successModal')?.classList.add('active');
        document.getElementById('agendarForm').reset();
        document.getElementById('agendarFormContainer').style.display = 'none';
        document.querySelectorAll('.doctor-button').forEach(b => b.classList.remove('selected'));
        doctorSeleccionado = null;
    } catch (e) {
        status.textContent = `❌ ${e.message || 'Error al agendar.'}`;
        status.style.color = 'var(--danger)';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Turno';
    }
});

// =============================================
// 7. BUSCAR MIS TURNOS POR DNI (Supabase)
// =============================================
async function buscarMisTurnos() {
    const sede = document.getElementById('consultaSede').value;
    const dni = document.getElementById('consultaDNI').value.trim();
    const container = document.getElementById('resultadoTurnos');

    if (!sede) { container.innerHTML = '<p style="color:var(--danger);text-align:center;">Seleccioná una sede.</p>'; return; }
    if (!dni) { container.innerHTML = '<p style="color:var(--danger);text-align:center;">Ingresá tu DNI.</p>'; return; }

    container.innerHTML = '<p class="loading-spinner" style="text-align:center;padding:2rem;">Buscando turnos...</p>';

    try {
        // Calcular hoy en zona AR
        const ahora = new Date();
        const hoyArg = new Date(ahora.toLocaleString('en-US', { timeZone: TZ }));
        hoyArg.setHours(0, 0, 0, 0);

        // PASO 1: Buscar directo por DNI
        let turnosPorDni = await supaFetch(
            `/registros?select=*&dni=eq.${encodeURIComponent(dni)}&sede=eq.${sede}&order=fecha_turno.asc&limit=100`
        ).catch(() => []);
        console.log('[Turnos] Por DNI directo:', turnosPorDni.length);

        // PASO 2: Buscar teléfono en personas por DNI
        const personas = await supaFetch(`/personas?select=telefono,nombre&dni=eq.${encodeURIComponent(dni)}&limit=5`).catch(() => []);
        console.log('[Personas] Por DNI:', personas);

        // Generar variantes del teléfono
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

        // DEPURACIÓN: Traer los últimos 5 turnos de cualquier persona en esta sede para ver el formato
        supaFetch(`/registros?select=numero,fecha_turno,sede&sede=eq.${sede}&order=fecha_turno.desc&limit=5`)
            .then(d => console.log('[DEBUG] Últimos 5 registros en esta sede:', d))
            .catch(() => {});

        // PASO 3: Buscar registros por teléfono
        let turnosPorTel = [];
        for (const tel of telefonos) {
            const res = await supaFetch(
                `/registros?select=*&numero=eq.${tel}&sede=eq.${sede}&order=fecha_turno.asc&limit=100`
            ).catch(() => []);
            console.log('[Registros] tel', tel, 'sede', sede, '→', res.length, 'registros');
            if (res && res.length) {
                turnosPorTel = [...turnosPorTel, ...res];
            }
        }

        // Unir ambas listas
        let turnos = [...turnosPorDni, ...turnosPorTel];

        // Eliminar duplicados
        const vistos = new Set();
        turnos = turnos.filter(t => {
            // usar el id principal o event_id o toda la fila serializada como key
            const key = t.id ? t.id.toString() : (t.event_id || JSON.stringify(t));
            if (vistos.has(key)) return false;
            vistos.add(key);
            return true;
        });

        // Filtrar fechas futuras en el cliente
        console.log('[Debug] Turnos antes del filtro:', turnos);
        turnos = turnos.filter(t => {
            const raw = t.fecha_turno || t.fecha || '';
            if (!raw) {
                console.log('[Filtro] Sin fecha:', t);
                return false;
            }
            
            // Intentar parsear diferentes formatos
            let d;
            if (raw.includes('/')) {
                // Posible formato DD/MM/YYYY
                const parts = raw.split(/[/\s:-]/);
                if (parts.length >= 3) {
                    // Asumimos DD/MM/YYYY
                    d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
                } else {
                    d = new Date(raw);
                }
            } else {
                d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
            }
            
            console.log('[Filtro] Comparando:', { raw, parseada: d, hoy: hoyArg, futuro: d >= hoyArg });
            
            // Si la fecha es inválida, la mostramos por las dudas
            if (isNaN(d.getTime())) {
                console.warn('[Filtro] Fecha inválida:', raw);
                return true; 
            }
            
            return d >= hoyArg;
        });
        console.log('[Debug] Turnos después del filtro:', turnos);

        if (!turnos.length) {
            container.innerHTML = '<div class="no-results">No hay turnos próximos para este DNI en la sede seleccionada.</div>';
            return;
        }

        container.innerHTML = turnos.map(t => {
            const raw = t.fecha_turno || t.fecha || '';
            const start = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
            const fechaStr = start.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
            const horaStr = raw.includes('T') ? start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : (t.hora || '');
            const eventId = t.event_id || t.eventId || '';
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
                        <button class="btn-reagendar" onclick="abrirReagendamiento('${eventId}', '${(t.profesional || '').replace(/'/g, '')}')">Reagendar</button>
                        <button class="btn-cancelar" onclick="cancelarTurno('${eventId}')">Cancelar</button>
                    </div>` : ''}
                </div>`;
        }).join('');
    } catch (e) {
        console.error('[buscarMisTurnos] Error:', e);
        container.innerHTML = `<div class="no-results" style="color:var(--danger);">Error: ${e.message}</div>`;
    }
}

// =============================================
// 8. CANCELAR TURNO (GHL API)
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
// 9. REAGENDAR TURNO
// =============================================
async function abrirReagendamiento(appointmentId, profesionalName) {
    document.getElementById('rescheduleAppointmentId').value = appointmentId;
    document.getElementById('rescheduleDate').value = '';
    document.getElementById('rescheduleTime').value = '';
    document.getElementById('rescheduleTimeSlotsContainer').innerHTML = '<p class="placeholder-text">Selecciona una fecha.</p>';
    document.getElementById('rescheduleStatus').textContent = '';
    document.getElementById('rescheduleModal').classList.add('active');

    // Buscar el calendarId del profesional en Supabase
    const container = document.getElementById('rescheduleDatePicker');
    container.innerHTML = '<p class="placeholder-text" style="margin:auto;">Cargando agenda...</p>';

    try {
        let calendarId = '';
        if (profesionalName) {
            const profs = await supaFetch(`/profesionales?select=calendar_id&profesional=ilike.*${encodeURIComponent(profesionalName.split(' - ')[0].trim())}*&limit=1`);
            if (profs.length) calendarId = profs[0].calendar_id;
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

        container.innerHTML = '';
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const fechas = Object.keys(data).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        let hayDias = false;

        fechas.forEach(dateStr => {
            const slots = data[dateStr]?.slots || data[dateStr];
            if (!Array.isArray(slots) || !slots.length) return;
            hayDias = true;
            const [y, m, d] = dateStr.split('-');
            const dateObj = new Date(y, m - 1, d);
            const card = document.createElement('div');
            card.className = 'date-card has-slots';
            card.onclick = () => seleccionarFechaReagendar(dateStr, card, data);
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
    if (!Array.isArray(slotsData) || !slotsData.length) { container.innerHTML = '<p class="placeholder-text">No hay horarios.</p>'; return; }

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
// INPUT FILTERS
// =============================================
document.getElementById('dni')?.addEventListener('input', e => e.target.value = e.target.value.replace(/\D/g, ''));
document.getElementById('consultaDNI')?.addEventListener('input', e => e.target.value = e.target.value.replace(/\D/g, ''));
document.getElementById('telefono')?.addEventListener('input', e => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 0 && !val.startsWith('549')) {
        if (val.startsWith('54')) val = '549' + val.substring(2);
        else if (val.startsWith('5')) val = '549' + val.substring(1);
        else val = '549' + val;
    }
    e.target.value = val;
});
document.getElementById('telefono')?.addEventListener('focus', e => { if (!e.target.value) e.target.value = '549'; });
document.getElementById('consultaDNI')?.addEventListener('keypress', e => { if (e.key === 'Enter') buscarMisTurnos(); });

// =============================================
// INIT
// =============================================
cargarEspecialidades();
