// =============================================
// CONFIGURACIÓN
// =============================================
let SUPABASE_URL = '';
let SUPABASE_HEADERS = {};
const TZ = 'America/Argentina/Buenos_Aires';

async function initConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('config endpoint failed');
        const cfg = await res.json();
        SUPABASE_URL = cfg.SUPABASE_URL || '';
        const key = cfg.SUPABASE_ANON_KEY || '';
        SUPABASE_HEADERS = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
        await cargarObrasSociales();
    } catch (_) {
        console.warn('[Config] No se pudo cargar configuración del servidor');
    }
}

const OSDE_PLANES = ['310', '410', '450', '510', '610'];

async function cargarObrasSociales() {
    const sel = document.getElementById('obraSocial');
    if (!sel) return;
    try {
        const data = await supaFetch('/obras_sociales?select=nombre&activa=eq.true&order=nombre.asc');
        const entries = [];
        for (const row of data) {
            const nombre = (row.nombre || '').trim();
            if (!nombre) continue;
            if (nombre.toLowerCase() === 'osde') {
                for (const plan of OSDE_PLANES) {
                    entries.push(`OSDE ${plan}`);
                }
            } else {
                entries.push(nombre.charAt(0).toUpperCase() + nombre.slice(1));
            }
        }
        sel.innerHTML = '<option value="" disabled selected>Seleccioná tu obra social *</option>';
        for (const label of entries) {
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            sel.appendChild(opt);
        }
    } catch (e) {
        console.warn('[ObrasSociales] No se pudo cargar desde Supabase:', e.message);
    }
}

// =============================================
// ESTADO GLOBAL
// =============================================
let disponibilidadGlobal = {};
let slotSeleccionado = null;
let bookingMode = 'profesional';
let profesionalesCache = []; // cache de profesionales de Supabase
let especialidadProfesionalesCache = []; // profs de la especialidad seleccionada actualmente

// =============================================
// SVG ICONS (stroke-based, brand colors)
// =============================================
const SVG_ICONS = {
    'odontologia-general': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C9 2 6 4.2 6 7c0 2 .5 3.6 1 5.6L8.2 20c.3 1.4 1 1.5 1.4 1.5s1-.4 1.2-1.5l.2-.8.2.8c.2 1.1.8 1.5 1.2 1.5s1.1-.1 1.4-1.5L15 12.6c.5-2 1-3.6 1-5.6C16 4.2 15 2 12 2z"/>
    </svg>`,

    'estetica-dental': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3C9 3 7 5.2 7 7.8c0 1.1.2 2 .6 3.2L8.8 15h6.4l1.2-4c.4-1.2.6-2.1.6-3.2C17 5.2 15 3 12 3z"/>
        <path d="M9.5 15v1.2a2.5 2.5 0 005 0V15"/>
        <path d="M10 9.5h4M9.5 12h5"/>
        <path d="M19 4l1.5-1.5M20.5 6H22M19 8l1.5 1.5"/>
    </svg>`,

    'ortodoncia-alineadores': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 3C5.3 3 4 4.5 4 6.3c0 1.3.3 2.3.6 3.6L5.5 14c.2.9.7 1 1 1s.6-.3.8-1l.2-.6.2.6c.2.7.5 1 .8 1s.8-.1 1-1l.9-4.1c.3-1.3.6-2.3.6-3.6C11 4.5 8.7 3 7 3z"/>
        <path d="M17 3c-1.7 0-3 1.5-3 3.3 0 1.3.3 2.3.6 3.6L15.5 14c.2.9.7 1 1 1s.6-.3.8-1l.2-.6.2.6c.2.7.5 1 .8 1s.8-.1 1-1l.9-4.1c.3-1.3.6-2.3.6-3.6C21 4.5 18.7 3 17 3z"/>
        <line x1="4" y1="8.8" x2="21" y2="8.8"/>
        <rect x="5.5" y="7.8" width="2.5" height="2" rx="0.4"/>
        <rect x="15.5" y="7.8" width="2.5" height="2" rx="0.4"/>
    </svg>`,

    'implantes-protesis': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2.5C6 2.5 4 4.2 4 6.5c0 1.5.3 2.6.7 4L5.5 13h13l.8-2.5c.4-1.4.7-2.5.7-4C20 4.2 18 2.5 16 2.5"/>
        <line x1="12" y1="13" x2="12" y2="21"/>
        <line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>
        <line x1="9.5" y1="17.5" x2="14.5" y2="17.5"/>
        <line x1="9.5" y1="19.5" x2="14.5" y2="19.5"/>
    </svg>`,

    'atm-bruxismo': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 9h14c0-3-2-5-4-5H9C7 4 5 6 5 9z"/>
        <path d="M5 15h14c0 3-2 5-4 5H9c-2 0-4-2-4-5z"/>
        <line x1="9" y1="4" x2="9" y2="9"/>
        <line x1="12" y1="4" x2="12" y2="9"/>
        <line x1="15" y1="4" x2="15" y2="9"/>
        <line x1="9" y1="15" x2="9" y2="20"/>
        <line x1="12" y1="15" x2="12" y2="20"/>
        <line x1="15" y1="15" x2="15" y2="20"/>
        <line x1="5" y1="12" x2="19" y2="12" stroke-width="1.2" stroke-dasharray="2.5 2"/>
    </svg>`,

    'odontopediatria': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 7C10 7 8 8.5 8 10.5c0 1.5.3 2.5.7 4l.9 5c.3 1.2.9 1.3 1.2 1.3s.8-.3 1-1.1l.2-.6.2.6c.2.8.7 1.1 1 1.1s.9-.1 1.2-1.3l.9-5c.4-1.5.7-2.5.7-4C16 8.5 14 7 12 7z"/>
        <path d="M9.5 5C9.2 4.2 8.3 3.8 7.7 4.3c-.7.6-.5 1.5.4 2.3C8.8 7.2 9.5 7.5 10 7.7c.1 0 .1 0 .5-.2.5-.3 1.2-.7 1.8-1.2.9-.8 1.1-1.7.4-2.3C12.1 3.5 11 3.8 10.5 5"/>
    </svg>`,

    'endodoncia-conductos': `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3C9.5 3 7 5 7 8c0 2 .6 3.5 1.2 5.5L9.5 20c.3 1.2.9 1.3 1.2 1.3s.8-.3 1-1.2l.3-.8.3.8c.2.9.7 1.2 1 1.2s.9-.1 1.2-1.3l1.3-6.5C16.4 11.5 17 10 17 8c0-3-2.5-5-5-5z"/>
        <line x1="9.5" y1="10" x2="14.5" y2="10" stroke-width="1.2"/>
        <line x1="12" y1="3" x2="12" y2="10" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>
    </svg>`
};

// =============================================
// ESPECIALIDADES — categorías de búsqueda (searchKeys consultan la DB; tratamientos vienen de Supabase)
// =============================================
const ESPECIALIDADES = [
    {
        id: 'odontologia-general',
        label: 'Odontología General',
        desc: 'Consultas, limpiezas y caries',
        searchKey: 'odontolog',
    },
    {
        id: 'estetica-dental',
        label: 'Estética Dental',
        desc: 'Reconstrucción, incrustaciones, carillas y coronas',
        searchKey: 'stética',
    },
    {
        id: 'ortodoncia-alineadores',
        label: 'Ortodoncia y Alineadores',
        desc: 'Brackets, Invisalign y corrección dental',
        searchKey: 'ortodon',
    },
    {
        id: 'implantes-protesis',
        label: 'Implantes y Prótesis',
        desc: 'Implantes, coronas y prótesis dentales',
        searchKeys: ['implant', 'protesis', 'prótesis'],
    },
    {
        id: 'atm-bruxismo',
        label: 'ATM · Bruxismo',
        desc: 'Dolor mandibular y apretamiento dental',
        searchKey: 'atm',
    },
    {
        id: 'odontopediatria',
        label: 'Odontopediatría y Ortopediatría',
        desc: 'Atención dental y ortopédica para niños',
        searchKey: 'pediatr',
    },
    {
        id: 'endodoncia-conductos',
        label: 'Endodoncia y Conductos',
        desc: 'Tratamientos de conducto y endodoncia',
        searchKeys: ['endodoncia', 'conducto'],
    },
];

// =============================================
// OVERRIDE CSV CLÍNICA (2026-06-11)
// Datos oficiales aplicados desde la WEB, sin tocar la DB de Supabase.
// Clave = calendar_id. Reemplaza especialidades + tratamientos del listado oficial.
// PROF_REMOVIDOS = profesionales que la clínica pidió sacar del listado.
// =============================================
const PROF_REMOVIDOS = new Set([
    'nQ7IXhCKF8Wzc4RIhx5P', // Dra. Muthular Milagros (Lanús) — "SACAR"
]);

const PROF_OVERRIDES = {
    // Lomas
    '5ytCBjhAChRiz1ensnPn': { especialidades: 'Endodoncia, Incrustaciones', tratamientos: 'Tratamiento de conducto, retratamiento endodóntico, restauraciones post-endodoncia, incrustaciones estéticas o metálicas, Corona' }, // Biagi
    '0n6XtIjxoeBaPi6hqfgG': { especialidades: 'Odontología general, Prótesis', tratamientos: 'Controles generales, limpiezas, obturaciones, extracciones simples, coronas, prótesis fija y removible, placas miorrelajantes, Prótesis y Corona' }, // Motta
    'Dyu7zKC6phLyMdfnjShs': { especialidades: 'Ortodoncia, Ortopedia, ATM, Implantes, Prótesis, Alineadores', tratamientos: 'consulta x ortodoncia u ortopedia, ajuste mensual de ortodoncia, ajuste mensual de ortopedia (removibles), consulta x ATM, consulta x implantes, consulta x cirugias complejas, consulta x protesis fija o removible' }, // Valenzuela Lomas
    'SgbpPdcPphpH7ZbkTFbc': { especialidades: 'Odontología general, Estética dental, Ortodoncia, Ortopedia, Prótesis, Incrustaciones', tratamientos: 'Ortodoncia, aparatología ortopédica, obturaciones, prótesis fija/removible, incrustaciones, rehabilitaciones estéticas, reposición de brackets, placas miorrelajantes, Ortodoncia/Ortopedia' }, // Aquino
    'Zq7100ll92Z4E0nz5KjK': { especialidades: 'Odontopediatría', tratamientos: 'Atención infantil, motivación, flúor, sellantes, operatoria en niños, extracciones de temporales, sellado de fisuras, prótesis para niños' }, // Cerpa
    'opojJgc5t7AP4qyI45W4': { especialidades: 'Endodoncia, Prótesis', tratamientos: 'Tratamientos de conducto, coronas, prótesis fija o removible, Prótesis y Corona' }, // Obregón
    'SUg5Zcw8yX5xFUmT6z8j': { especialidades: 'Odontología general, Ortodoncia', tratamientos: 'Controles generales, limpiezas, ortodoncia con brackets, obturaciones, reposición de brackets' }, // Peñafiel
    'USfwitDKerLMat4LHTGv': { especialidades: 'Odontología general, Ortodoncia, Ortopedia', tratamientos: 'consulta general niños o adultos, consulta x ortodoncia u ortopedia, ajuste mensual de ortodoncia u ortopedia' }, // Ponce Lomas
    'HlKSamINK5hVjaPGQ0bf': { especialidades: 'Odontopediatría, Ortopedia', tratamientos: 'Atención infantil, aparatología ortopédica, flúor, sellantes, prevención, extracciones de piezas temporales, prótesis para niños' }, // Ramírez
    'm0N9lnZ8bDodxxuM7Dmb': { especialidades: 'Odontología general, Estética dental', tratamientos: 'Consulta general de adultos, consulta general de niños, consulta x protesis x ioma, consulta protesis particular o reintegro' }, // Salvi Lomas
    '9hUrMoPHICcNwn3j34Ap': { especialidades: 'Periodoncia, Odontología general, Prótesis fija/removible', tratamientos: 'Limpiezas profundas, tratamiento periodontal, extracción de muelas del juicio, prótesis, operatoria, controles, extracción de terceros molares (cirugía compleja). Perodoncia, Cirugías, placas miorrelajantes, Prótesis y Corona' }, // Sarmiento
    '4nhfGeawwbLnukdFOCuf': { especialidades: 'odontologia general', tratamientos: 'Controles generales, limpiezas, obturaciones' }, // Casero
    'o6FWZQIlCu0UXf4B2VtU': { especialidades: 'odontologia general, ortodoncia, ortopedia', tratamientos: 'Controles generales, limpiezas, obturaciones, ortodoncia y ortopedia, placas miorrelajantes, Ortodoncia/Ortopedia' }, // Ortiz
    // Lanús
    'I9lqSdOdbX7a7TEooHlK': { especialidades: 'Ortodoncia, Ortopedia, ATM, Implantes, Prótesis, Alineadores', tratamientos: 'Brackets, alineadores, aparatología ortopédica, férulas de ATM, rehabilitaciones protésicas, implantes, coronas, mantenimiento de ortodoncia, ortosis, reposición de brackets, placas miorrelajantes, ATM, Prótesis y Corona' }, // Valenzuela Lanús
    'tvQtc4Cbbvy2JUH11dCg': { especialidades: 'Odontología general, Odontopediatría, Prótesis fija/removible', tratamientos: 'consulta general niños, consulta general adultos, consulta x protesis' }, // Camelli
    'OdJ6ieB1wKQ0lg4i8Nfm': { especialidades: 'Odontología general, Estética dental, Prótesis fija/removible', tratamientos: 'consulta general adultos, consulta general niños, consulta x protesis' }, // Pelagatti
    'cdPzPXYlx7vqn0Xeut1C': { especialidades: 'Odontología general, Ortodoncia, Ortopedia', tratamientos: 'Controles generales de adultos y niños, limpieza, obturaciones, ortodoncia con brackets, aparatología ortopédica, placas miorrelajantes, Ortodoncia/Ortopedia' }, // Ponce Lanús
    '6e69xtepQnxdVOQ9DhRr': { especialidades: 'Odontología general, Estética dental', tratamientos: 'Controles generales de adultos y niños, limpiezas, obturaciones, extracciones simples, protesis removibles' }, // Salvi Lanús
    'K6v0lMO22Ft7KbBl6fM3': { especialidades: 'odontología general de adultos y niños, tratamientos de conductos uniradiculares, exodoncias simples y protesis', tratamientos: 'Consulta general de adultos, consulta general de niños, consulta x protesis, consulta x cirugia' }, // Figueroa
    'e4VigEgguTyY1ZSgwrqF': { especialidades: 'odontología general de adultos y niños, tratamientos de conductos uniradiculares, exodoncias simples y protesis', tratamientos: 'Consulta general de adultos, consulta general de niños, tratamiento de conductos simple, consulta x protesis' }, // Viegas
    'qAQRMl84iTrT4Sp1F7rT': { especialidades: 'Ortodoncia, Ortopedia, odontologia general, protesis', tratamientos: 'Consulta general, Consulta x ortodoncia u ortopedia, ajuste mensual de ortodoncia, ajuste mensual de ortopedia, consulta por proteis' }, // Xavier Coronel
    'FJ3Hma07moKs2EzxTt6N': { especialidades: 'Odontologia general, tratamientos de conductos premolares, exodoncia simples y 3ros no complejas, protesis', tratamientos: 'Consulta general adultos, tratamiento de conducto simple, consulta x protesis, consulta x cirugia' }, // Ventura
};

// Aplica el override CSV a filas crudas de Supabase: saca removidos y reemplaza datos.
function aplicarOverridesCSV(rows) {
    return (rows || [])
        .filter(p => !PROF_REMOVIDOS.has(p.calendar_id))
        .map(p => {
            const ov = PROF_OVERRIDES[p.calendar_id];
            return ov ? { ...p, ...ov } : p;
        });
}

// Carga (y cachea) todos los profesionales con el override ya aplicado.
async function getProfesionalesCache() {
    if (!profesionalesCache.length) {
        const data = await supaFetch('/profesionales?select=*&order=profesional.asc');
        profesionalesCache = aplicarOverridesCSV(data);
    }
    return profesionalesCache;
}

// Filtra profesionales por especialidad (searchKeys) + sede, client-side sobre especialidades del CSV.
function filtrarPorEspecialidad(profs, searchKeys, sedeNorm) {
    const keys = (Array.isArray(searchKeys) ? searchKeys : [searchKeys]).map(normStr).filter(Boolean);
    return profs.filter(p => {
        if (!normStr(p.sede).includes(sedeNorm)) return false;
        const esp = normStr(p.especialidades);
        return keys.some(k => esp.includes(k));
    });
}

let especialidadSeleccionada = null;
let sedeSeleccionada = '';

function setSede(sede) {
    sedeSeleccionada = sede;
    profesionalesCache = [];
    especialidadSeleccionada = null;
    bookingMode = null;
    resetBookingForm();

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));

    const profContainer = document.getElementById('profGridContainer');
    const espContainer = document.getElementById('espGridContainer');
    if (profContainer) profContainer.style.display = 'none';
    if (espContainer) espContainer.style.display = 'none';

    const modeSelector = document.getElementById('bookingModeSelector');
    if (modeSelector) modeSelector.style.display = sede ? 'block' : 'none';
}

function setBookingMode(mode) {
    bookingMode = mode;
    especialidadSeleccionada = null;
    resetBookingForm();

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${mode}"]`)?.classList.add('active');

    const profContainer = document.getElementById('profGridContainer');
    const espContainer = document.getElementById('espGridContainer');

    if (mode === 'profesional') {
        if (espContainer) espContainer.style.display = 'none';
        if (profContainer) { profContainer.style.display = 'block'; cargarProfesionalesSelect(); }
    } else {
        if (profContainer) profContainer.style.display = 'none';
        if (espContainer) { espContainer.style.display = 'block'; renderEspecialidadCards(); }
    }
}

function renderEspecialidadCards() {
    const container = document.getElementById('espGridContainer');
    if (!container) return;
    const grid = document.createElement('div');
    grid.className = 'esp-grid';
    ESPECIALIDADES.forEach(esp => {
        const card = document.createElement('div');
        card.className = 'esp-card';
        card.dataset.id = esp.id;
        card.innerHTML = `
            <div class="esp-card-icon">${SVG_ICONS[esp.id] || ''}</div>
            <div class="esp-card-name">${esp.label}</div>
            <div class="esp-card-desc">${esp.desc}</div>
        `;
        card.onclick = () => {
            document.querySelectorAll('.esp-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            especialidadSeleccionada = esp;
            especialidadProfesionalesCache = [];
            if (!sedeSeleccionada) {
                document.getElementById('agendarFormContainer').style.display = 'block';
                document.getElementById('datePickerContainer').innerHTML =
                    '<p class="placeholder-text" style="margin:auto;">Primero seleccioná una sede.</p>';
                return;
            }
            cargarTratamientosPorEspecialidad(esp.searchKeys || [esp.searchKey], sedeSeleccionada);
        };
        grid.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(grid);
}

function normStr(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Normaliza tratamientos: acepta array (jsonb) o string de texto (csv / newlines)
function normalizarItem(t) {
    t = t.replace(/\bx\b/g, 'por');
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function normalizarTratamientos(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean).map(normalizarItem);
    if (!raw || typeof raw !== 'string') return [];
    return raw
        .split(/[\n\r,]+/)
        .map(t => t.replace(/^[-\s]+/, '').trim())
        .filter(t => t.length > 0)
        .map(normalizarItem);
}

function poblarTratamientos(lista, profesionalNombre = '') {
    const sel = document.getElementById('tratamientoSelect');
    const hidden = document.getElementById('tratamiento');
    if (!sel || !hidden) return;
    hidden.value = '';
    sel.innerHTML = '';
    if (!lista || lista.length === 0) {
        sel.innerHTML = '<option value="">No hay tratamientos disponibles</option>';
        sel.disabled = true;
        return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleccioná el tratamiento';
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);
    lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        const durMin = getDuracionMinutos(t, profesionalNombre);
        opt.textContent = durMin ? `${t} (${durMin} min)` : t;
        sel.appendChild(opt);
    });
    sel.disabled = false;
    sel.onchange = () => {
        hidden.value = sel.value;
        hidden.dispatchEvent(new Event('change'));
    };
}

function resetBookingForm() {
    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('agendarFormContainer').style.display = 'none';
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';
    document.getElementById('datePickerContainer').innerHTML = '<p class="placeholder-text">Cargando agenda...</p>';
    const tSel = document.getElementById('tratamientoSelect');
    if (tSel) { tSel.innerHTML = '<option value="">Seleccioná primero una especialidad o profesional</option>'; tSel.disabled = true; }
    const tHidden = document.getElementById('tratamiento');
    if (tHidden) tHidden.value = '';
}

// =============================================
// DURACIÓN POR TRATAMIENTO
// Retorna minutos para tratamientos específicos; null = usar slotDuration del calendario
// =============================================
function getDuracionMinutos(tratamiento, profesionalNombre = '') {
    const t = (tratamiento || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const p = (profesionalNombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Consulta de implantes o cirugía → 15 min (debe ir antes del match genérico de implante)
    if (/consulta.*implante|implante.*consulta/.test(t)) return 15;
    if (/consulta.*cirug|cirug.*consulta/.test(t)) return 15;
    // Conducto/endodoncia → duración por profesional (CSV clínica 2026-06-11):
    // Biagi y Ventura → 45 min, Obregón → 25 min, resto → 15 min.
    // endodont* cubre "endodóntico"/"endodontic" (normalizado pierde la tilde)
    if (/conducto|endodoncia|endodont/.test(t)) {
        if (/biagi|ventura/.test(p)) return 45;
        if (/obregon/.test(p)) return 25;
        return 15;
    }
    // Colocación de implante → 45 min
    if (/implante/.test(t)) return 45;
    return null;
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
    if (!res.ok) {
        const raw = Array.isArray(json.message)
            ? json.message.join(', ')
            : (json.message || json.msg || json.error);
        const msg = String(raw || `GHL Error ${res.status}`);
        if (/does not have access to this location/i.test(msg)) {
            throw new Error(
                'El token de GHL no tiene acceso a la sede configurada. ' +
                'Generá el Private Integration Token dentro de la sub-cuenta MGV y actualizá GHL_API_KEY en Vercel.'
            );
        }
        throw new Error(msg);
    }
    return json;
}

// =============================================
// 1A. RENDER ESPECIALIDADES (hardcoded)
// =============================================
// Las especialidades son fijas — no se cargan desde Supabase

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
        await getProfesionalesCache();
        poblarSelectProfesionales();
    } catch (e) {
        console.error(e);
        if (container) container.innerHTML = '<p class="placeholder-text" style="text-align:center;color:var(--danger);">Error al cargar profesionales.</p>';
    }
}

function poblarSelectProfesionales() {
    const container = document.getElementById('profGridContainer');
    if (!container) return;

    let profs = profesionalesCache;
    if (sedeSeleccionada) profs = profs.filter(p => (p.sede || '') === sedeSeleccionada);

    if (!profs.length) {
        container.innerHTML = '<p class="placeholder-text" style="text-align:center;padding:1.5rem;">No hay profesionales para esta sede.</p>';
        return;
    }

    // Agrupar por sede
    const grupos = {};
    profs.forEach(prof => {
        const sede = prof.sede || 'Sin sede';
        if (!grupos[sede]) grupos[sede] = [];
        grupos[sede].push(prof);
    });

    container.innerHTML = '';
    const sedes = Object.keys(grupos).sort();

    sedes.forEach(sede => {
        // Header de sede (solo si hay más de una sede visible)
        if (sedes.length > 1) {
            const header = document.createElement('div');
            header.className = 'prof-sede-header';
            header.textContent = sede;
            container.appendChild(header);
        }

        const grid = document.createElement('div');
        grid.className = 'prof-grid';

        grupos[sede].forEach(prof => {
            const card = document.createElement('div');
            card.className = 'prof-card';
            card.dataset.calendarId = prof.calendar_id;
            const nameEl = document.createElement('div');
            nameEl.className = 'prof-card-name';
            nameEl.textContent = prof.profesional;
            card.appendChild(nameEl);
            if (prof.sede) {
                const badge = document.createElement('span');
                badge.className = 'prof-card-badge';
                badge.textContent = `Sede: ${prof.sede}`;
                card.appendChild(badge);
            }
            card.onclick = () => {
                document.querySelectorAll('.prof-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                onProfesionalCardSelected(prof);
            };
            grid.appendChild(card);
        });

        container.appendChild(grid);
    });
}

// =============================================
// HANDLERS DE SELECCIÓN
// =============================================
function onEspecialidadChange() {
    // Kept for compatibility; actual selection via card click
}

function onProfesionalChange() {
    const calendarId = document.getElementById('profesionalSelect')?.value;
    if (!calendarId) { resetBookingForm(); return; }
    const prof = profesionalesCache.find(p => p.calendar_id === calendarId);
    onProfesionalCardSelected(prof || { calendar_id: calendarId });
}

function onProfesionalCardSelected(prof) {
    const parsed = normalizarTratamientos(prof.tratamientos);
    const lista = parsed.length ? parsed : ['Consulta general', 'Control / Revisación', 'Urgencia'];
    poblarTratamientos(lista, prof.profesional || '');
    cargarSlotsCalendar(prof.calendar_id);
}

// =============================================
// 2A. CARGAR SLOTS POR ESPECIALIDAD
// =============================================
async function cargarSlotsEspecialidad(keys) {
    // keys puede ser string o array de strings
    const searchKeys = Array.isArray(keys) ? keys : [keys];
    const formContainer = document.getElementById('agendarFormContainer');
    const dateContainer = document.getElementById('datePickerContainer');

    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';

    if (!searchKeys.length || !searchKeys[0]) {
        formContainer.style.display = 'none';
        return;
    }

    if (!sedeSeleccionada) {
        formContainer.style.display = 'block';
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Primero seleccioná una sede (Lanús o Lomas).</p>';
        return;
    }

    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Buscando turnos disponibles...</p>';

    try {
        // Normalizar sede para comparación insensitive (acento + case)
        const sedeNorm = sedeSeleccionada.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

        // Hacer una query por cada searchKey y deduplicar por calendar_id
        const allProfsArrays = await Promise.all(
            searchKeys.map(key =>
                supaFetch(`/profesionales?select=*&especialidades=ilike.*${encodeURIComponent(key)}*&sede=ilike.*${encodeURIComponent(sedeNorm)}*`)
                    .catch(() => [])
            )
        );
        const seenCalIds = new Set();
        const profs = allProfsArrays.flat().filter(p => {
            if (seenCalIds.has(p.calendar_id)) return false;
            seenCalIds.add(p.calendar_id);
            return true;
        });

        if (!profs.length) {
            dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay profesionales para esta especialidad en esta sede.</p>';
            return;
        }

        const tz = TZ;

        const results = await Promise.all(profs.map(async prof => {
            try {
                const merged = await ghlFetchSlots3Months(prof.calendar_id, tz);
                return parsearSlots(merged, prof);
            } catch { return []; }
        }));

        const allSlots = results.flat();
        if (allSlots.length === 0) {
            dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Sin turnos disponibles en los próximos 3 meses para esta especialidad. Probá con la otra sede o contactanos por WhatsApp.</p>';
            return;
        }

        poblarDisponibilidad([allSlots]);
        dibujarTarjetasDeDias(dateContainer);
    } catch (e) {
        dateContainer.innerHTML = `<p style="color:var(--danger);margin:auto;">Error: ${escapeHtml(e.message)}</p>`;
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

    if (!sedeSeleccionada) {
        formContainer.style.display = 'block';
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Primero seleccioná una sede (Lanús o Lomas).</p>';
        return;
    }

    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Buscando turnos disponibles...</p>';

    try {
        const prof = profesionalesCache.find(p => p.calendar_id === calendarId);
        const tz = TZ;

        const merged = await ghlFetchSlots3Months(calendarId, tz);
        const slots = parsearSlots(merged, prof || { calendar_id: calendarId, profesional: 'Profesional', sede: '' });
        poblarDisponibilidad([slots]);
        dibujarTarjetasDeDias(dateContainer);
    } catch (e) {
        dateContainer.innerHTML = `<p style="color:var(--danger);margin:auto;">Error: ${escapeHtml(e.message)}</p>`;
    }
}

// =============================================
// HELPERS DE SLOTS
// =============================================

// GHL limita el rango a 31 días por request. Para cubrir 3 meses hacemos 3 chunks.
async function ghlFetchSlots3Months(calendarId, tz) {
    const CHUNK = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const chunks = await Promise.all([0, 1, 2].map(i =>
        ghlFetch(`calendars/${calendarId}/free-slots?startDate=${now + i * CHUNK}&endDate=${now + (i + 1) * CHUNK}&timezone=${encodeURIComponent(tz)}`).catch(() => ({}))
    ));
    const merged = {};
    chunks.forEach(raw => {
        const map = raw?.slots || raw?.data || raw || {};
        Object.assign(merged, map);
    });
    return merged;
}

// GHL devuelve ISOs sin timezone ("2026-05-20T09:00:00") cuando se pide ART.
// Sin offset, new Date() los interpreta como UTC → 3h de diferencia.
// Normalizamos agregando -03:00 si no tienen timezone.
function normalizarIsoArt(iso) {
    if (!iso || /[Z+\-]\d{2}:\d{2}$/.test(iso) || iso.endsWith('Z')) return iso;
    return iso + '-03:00';
}

function parsearSlots(raw, prof) {
    const slotsMap = raw?.slots || raw?.data || raw || {};
    const collected = [];
    Object.entries(slotsMap).forEach(([dateStr, dayData]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        const slots = dayData?.slots || dayData;
        if (!Array.isArray(slots)) return;
        slots.forEach(slot => {
            const isoRaw = typeof slot === 'string' ? slot : (slot.startTime || slot.time || null);
            if (!isoRaw || typeof isoRaw !== 'string') return;
            const iso = normalizarIsoArt(isoRaw);
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
            const key = `${slot.iso}|${slot.calendarId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.d - b.d);

    parsed.forEach(slot => {
        const tv = slot.d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
        const btn = document.createElement('div');
        btn.className = 'time-slot-btn';
        btn.textContent = tv;
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
document.getElementById('agendarForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const status = document.getElementById('agendarStatus');

    const nombre    = document.getElementById('nombre').value.trim();
    const apellido  = document.getElementById('apellido').value.trim();
    const dni       = document.getElementById('dni').value.trim();
    const telRaw    = document.getElementById('telefono').value.replace(/\D/g, '');
    const email     = document.getElementById('email')?.value.trim() || '';
    const tratamiento = document.getElementById('tratamiento').value.trim();
    const startTime = document.getElementById('appointmentTime').value;

    // Validaciones
    const obraSocialCheck = document.getElementById('obraSocial')?.value || '';
    if (!nombre || !apellido || !dni || !telRaw || !email) {
        setStatus(status, 'Completá todos los campos obligatorios.');
        return;
    }
    if (!obraSocialCheck) {
        setStatus(status, 'Seleccioná tu obra social o prepaga.');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus(status, 'Ingresá un email válido.');
        return;
    }
    if (!/^\d{7,8}$/.test(dni)) {
        setStatus(status, 'El DNI debe tener 7 u 8 dígitos numéricos.');
        return;
    }
    if (/^(\d)\1+$/.test(dni)) {
        setStatus(status, 'El DNI ingresado no es válido.');
        return;
    }
    if (!/^\d{10}$/.test(telRaw)) {
        setStatus(status, 'El teléfono debe tener 10 dígitos (sin el 549).');
        return;
    }
    if (!tratamiento) {
        setStatus(status, 'Seleccioná el tratamiento.');
        return;
    }
    if (!startTime || !slotSeleccionado) {
        setStatus(status, 'Seleccioná fecha y horario.');
        return;
    }

    // Armar resumen para el modal de confirmación
    const fechaStr = slotSeleccionado.startTime
        ? new Date(slotSeleccionado.startTime).toLocaleString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit', timeZone: TZ
          })
        : slotSeleccionado.dateLabel || '';
    const profesional = slotSeleccionado.profesionalNombre || '';
    const sede = slotSeleccionado.sedeName || slotSeleccionado.calendarName || sedeSeleccionada || '';
    const durMin = getDuracionMinutos(tratamiento, profesional);
    const obraSocialModal = document.getElementById('obraSocial')?.value || '';
    const planModal = document.getElementById('planObraSocial')?.value.trim() || '';
    const obraSocialModalStr = obraSocialModal && planModal ? `${obraSocialModal} — Plan ${planModal}` : obraSocialModal;

    document.getElementById('preConfirmSummary').innerHTML = `
        <div><strong>Paciente:</strong> ${escapeHtml(nombre)} ${escapeHtml(apellido)}</div>
        <div><strong>Profesional:</strong> ${escapeHtml(profesional)}</div>
        <div><strong>Sede:</strong> ${escapeHtml(sede)}</div>
        <div><strong>Tratamiento:</strong> ${escapeHtml(tratamiento)}${durMin ? ` <span style="font-size:0.82rem;color:#5FA9DD;font-weight:600;">(${durMin} min)</span>` : ''}</div>
        ${obraSocialModalStr ? `<div><strong>Obra Social:</strong> ${escapeHtml(obraSocialModalStr)}</div>` : ''}
        <div><strong>Fecha y hora:</strong> ${escapeHtml(fechaStr)}</div>
    `;
    document.getElementById('preConfirmStatus').textContent = '';
    document.getElementById('preConfirmModal').classList.add('active');
});

document.getElementById('preConfirmSubmitBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('preConfirmSubmitBtn');
    const status = document.getElementById('preConfirmStatus');
    btn.disabled = true;
    btn.textContent = 'Confirmando...';
    try {
        await ejecutarAgendamiento();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar Turno';
    }
});

async function ejecutarAgendamiento() {
    const status = document.getElementById('preConfirmStatus');

    const nombre    = document.getElementById('nombre').value.trim();
    const apellido  = document.getElementById('apellido').value.trim();
    const dni       = document.getElementById('dni').value.trim();
    const telRaw    = document.getElementById('telefono').value.replace(/\D/g, '');
    const telefono  = '549' + telRaw;
    const obraSocial = document.getElementById('obraSocial')?.value || '';
    const planOS     = document.getElementById('planObraSocial')?.value.trim() || '';
    const obraSocialConPlan = obraSocial && planOS ? `${obraSocial} - Plan ${planOS}` : obraSocial;
    const email     = document.getElementById('email')?.value.trim() || '';
    const tratamiento = document.getElementById('tratamiento').value.trim();
    const startTime = document.getElementById('appointmentTime').value;

    let appointmentId = null;

    try {
        // 0. Pre-flight: verificar que el slot sigue disponible (anti-solapamiento)
        try {
            const startMs = new Date(startTime).getTime();
            const endMs = startMs + 24 * 60 * 60 * 1000;
            const freshSlots = await ghlFetch(
                `calendars/${slotSeleccionado.calendarId}/free-slots?startDate=${startMs}&endDate=${endMs}&timezone=${encodeURIComponent(TZ)}`
            );
            const dayKey = startTime.slice(0, 10);
            const dayData = freshSlots?.slots?.[dayKey] || freshSlots?.data?.[dayKey] || freshSlots?.[dayKey];
            const slotArr = dayData?.slots || (Array.isArray(dayData) ? dayData : []);
            const stillFree = slotArr.some(s => {
                const st = s.startTime || s.time || s;
                return typeof st === 'string' && new Date(st).getTime() === startMs;
            });
            if (!stillFree) {
                throw new Error('Ese horario se ocupó. Elegí otro disponible.');
            }
        } catch (e) {
            if (/ocupó/i.test(e.message)) throw e;
            // Si falla el check (red, etc.) dejamos continuar para no bloquear innecesariamente
        }

        // 1. Buscar o crear contacto en GHL
        let contactId;
        try {
            const search = await ghlFetch(`contacts/search/duplicate?number=${encodeURIComponent(telefono)}`);
            contactId = search?.contact?.id;
        } catch (_) { /* no encontrado */ }

        if (!contactId) {
            const created = await ghlFetch('contacts/', {
                method: 'POST',
                body: JSON.stringify({
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
        const duracionMin = getDuracionMinutos(tratamiento, slotSeleccionado?.profesionalNombre || '');
        const startMs = new Date(startTime).getTime();
        const customEndTime = duracionMin
            ? new Date(startMs + duracionMin * 60_000).toISOString()
            : undefined;

        let appointmentRes;
        try {
            appointmentRes = await ghlFetch('calendars/events/appointments', {
                method: 'POST',
                body: JSON.stringify({
                    calendarId: slotSeleccionado.calendarId,
                    contactId,
                    startTime,
                    ...(customEndTime ? { endTime: customEndTime } : {}),
                    title: `${nombre} ${apellido}${obraSocialConPlan ? ' - ' + obraSocialConPlan : ''} - ${tratamiento}`,
                    appointmentStatus: 'confirmed'
                })
            });
        } catch (ghlErr) {
            const msg = ghlErr.message || '';
            if (/conflict|409|422|not available|unavailable|ocupad|slot/i.test(msg)) {
                throw new Error('Ese horario se ocupó mientras completabas el formulario. Elegí otro disponible.');
            }
            throw ghlErr;
        }
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
                'Obra Social': obraSocialConPlan,
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

        cerrarModal('preConfirmModal');

        const successMsg = document.getElementById('successModalMsg');
        if (successMsg) {
            successMsg.textContent = email
                ? `Te enviamos la confirmación a ${email}.`
                : 'Recibirás la confirmación en tu WhatsApp.';
        }
        document.getElementById('successModal')?.classList.add('active');

        // Confirmación por email — fire-and-forget
        if (email) {
            fetch('/api/send-confirmacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    first_name: nombre,
                    last_name: apellido,
                    full_name: `${nombre} ${apellido}`,
                    phone: telefono,
                    Tratamiento: tratamiento,
                    'Obra Social': obraSocialConPlan,
                    profesional: slotSeleccionado?.profesionalNombre || '',
                    sede: slotSeleccionado?.sedeName || slotSeleccionado?.calendarName || '',
                    startTime,
                    appointmentId
                })
            }).catch(() => {});
        }

        document.getElementById('agendarForm').reset();
        const tSelPost = document.getElementById('tratamientoSelect');
        if (tSelPost) { tSelPost.innerHTML = '<option value="">Seleccioná primero una especialidad o profesional</option>'; tSelPost.disabled = true; }
        document.getElementById('agendarFormContainer').style.display = 'none';
        disponibilidadGlobal = {};
        slotSeleccionado = null;
    } catch (e) {
        setStatus(status, e.message || 'Error al agendar.', 'var(--danger)');
    }
}

function setStatus(el, msg, color) {
    el.textContent = msg;
    el.style.color = color || 'var(--danger)';
    el.classList.add('active');
}

// =============================================
// 5. BUSCAR MIS TURNOS POR DNI (via GHL)
// =============================================
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// GHL devuelve fechas de turnos como "YYYY-MM-DD HH:mm:ss" en horario LOCAL (ART = UTC-3), sin timezone marker.
// Agregar Z los trataba como UTC → mostraba 3h menos. Usar -03:00 para interpretarlos correctamente.
function ghlTimeToIso(raw) {
    if (!raw) return null;
    // "2026-06-05 13:00:00" (ART) → "2026-06-05T13:00:00-03:00"
    return raw.replace(' ', 'T') + '-03:00';
}

let _buscandoTurnos = false;
async function buscarMisTurnos() {
    if (_buscandoTurnos) return;
    _buscandoTurnos = true;
    const sede = document.getElementById('consultaSede').value;
    const dni = document.getElementById('consultaDNI').value.trim();
    const container = document.getElementById('resultadoTurnos');

    if (!sede) { container.innerHTML = '<p class="status-error">Seleccioná una sede.</p>'; return; }
    if (!dni)  { container.innerHTML = '<p class="status-error">Ingresá tu DNI.</p>'; return; }

    container.innerHTML = '<p class="loading-spinner">Buscando turnos...</p>';

    try {
        // 1. Buscar teléfono en personas (Supabase) por DNI
        const personas = await supaFetch(
            `/personas?select=telefono,nombre,obra_social&dni=eq.${encodeURIComponent(dni)}&limit=5`
        ).catch(() => []);

        const personasInfo = { telefono: '', fullName: '', obraSocial: '' };
        const telefonos = new Set();

        if (personas && personas.length) {
            const p0 = personas[0];
            personasInfo.fullName = (p0.nombre || '').trim();
            personasInfo.obraSocial = p0.obra_social || '';
            personas.forEach(p => {
                const raw = String(p.telefono || '').replace(/\D/g, '');
                if (!raw) return;
                telefonos.add(raw);
                if (raw.startsWith('549')) {
                    telefonos.add(raw.slice(3));
                    telefonos.add(raw.slice(2));
                } else if (raw.startsWith('54')) {
                    telefonos.add(raw.slice(2));
                } else {
                    telefonos.add('54' + raw);
                    telefonos.add('549' + raw);
                }
            });
            personasInfo.telefono = [...telefonos][0] || '';
        }

        // 2. Buscar contactId en GHL por teléfono
        let contactId = null;
        for (const tel of telefonos) {
            try {
                const res = await ghlFetch(`contacts/search/duplicate?number=${encodeURIComponent(tel)}`);
                if (res?.contact?.id) {
                    contactId = res.contact.id;
                    if (!personasInfo.fullName) {
                        const c = res.contact;
                        personasInfo.fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
                    }
                    break;
                }
            } catch (_) {}
        }

        if (!contactId) {
            container.innerHTML = '<div class="no-results">No encontramos tu información. Verificá que el DNI sea correcto o contactanos por WhatsApp.</div>';
            return;
        }

        // 3. Obtener turnos del contacto en GHL
        const apptRes = await ghlFetch(`contacts/${contactId}/appointments`);
        const appointments = apptRes?.events || apptRes?.appointments || [];

        // 4. Cargar mapa de profesionales: calendarId → { profesional, sede }
        const allProfs = await supaFetch('/profesionales?select=profesional,sede,calendar_id').catch(() => []);
        const calendarMap = {};
        (allProfs || []).forEach(p => {
            if (p.calendar_id) calendarMap[p.calendar_id] = { profesional: p.profesional, sede: p.sede };
        });

        // 5. Filtrar: futuros, no eliminados, sede correcta
        const ahora = new Date();
        const hoyArg = new Date(ahora.toLocaleString('en-US', { timeZone: TZ }));
        hoyArg.setHours(0, 0, 0, 0);

        const filtered = appointments.filter(apt => {
            if (apt.deleted) return false;
            const profData = calendarMap[apt.calendarId];
            if ((profData?.sede || '') !== sede) return false;
            const startIso = ghlTimeToIso(apt.startTime);
            const startDate = startIso ? new Date(startIso) : null;
            return startDate && startDate >= hoyArg;
        }).sort((a, b) => {
            return new Date(ghlTimeToIso(a.startTime)) - new Date(ghlTimeToIso(b.startTime));
        });

        if (!filtered.length) {
            container.innerHTML = '<div class="no-results">No hay turnos próximos para este DNI en la sede seleccionada.</div>';
            return;
        }

        // 6. Renderizar tarjetas
        const cards = filtered.map(apt => {
            const profData = calendarMap[apt.calendarId] || {};
            const profesionalRow = profData.profesional || '';
            const sedeRow = profData.sede || sede;
            const isoStart = ghlTimeToIso(apt.startTime);
            const start = new Date(isoStart);
            const fechaStr = start.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ });
            const horaStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
            const rawStatus = (apt.appointmentStatus || 'confirmed').toLowerCase();
            const isCancelled = rawStatus === 'cancelled' || rawStatus === 'cancelado';

            const statusMap = {
                confirmed: { label: 'Confirmado', cls: 'status-confirmed' },
                booked: { label: 'Confirmado', cls: 'status-confirmed' },
                cancelled: { label: 'Cancelado', cls: 'status-cancelled' },
                showed: { label: 'Atendido', cls: 'status-confirmed' },
                noshow: { label: 'No asistió', cls: 'status-cancelled' },
            };
            const st = statusMap[rawStatus] || { label: rawStatus, cls: 'status-pending' };

            const tratamiento = apt.title || '';
            const calendarName = `${profesionalRow}${sedeRow ? ' - ' + sedeRow : ''}`;
            const phone = personasInfo.telefono || '';
            const fullName = personasInfo.fullName || '';

            const actionsHtml = (!isCancelled && apt.id) ? `
                <div class="turno-actions">
                    <button class="btn-reagendar"
                            data-action="reschedule"
                            data-event-id="${escapeHtml(apt.id)}"
                            data-calendar-id="${escapeHtml(apt.calendarId)}"
                            data-current-iso="${escapeHtml(isoStart)}"
                            data-profesional="${escapeHtml(profesionalRow)}"
                            data-sede="${escapeHtml(sedeRow)}"
                            data-tratamiento="${escapeHtml(tratamiento)}"
                            data-calendar-name="${escapeHtml(calendarName)}"
                            data-dni="${escapeHtml(dni)}"
                            data-full-name="${escapeHtml(fullName)}"
                            data-phone="${escapeHtml(phone)}"
                            data-obra-social="${escapeHtml(personasInfo.obraSocial)}">Reagendar</button>
                    <button class="btn-cancelar"
                            data-action="cancel"
                            data-event-id="${escapeHtml(apt.id)}"
                            data-tratamiento="${escapeHtml(tratamiento)}"
                            data-fecha="${escapeHtml(fechaStr)}${horaStr ? ' a las ' + escapeHtml(horaStr) : ''}"
                            data-dni="${escapeHtml(dni)}"
                            data-full-name="${escapeHtml(fullName)}"
                            data-phone="${escapeHtml(phone)}"
                            data-calendar-name="${escapeHtml(calendarName)}">Cancelar</button>
                </div>` : '';

            return `
                <div class="turno-card">
                    <div class="turno-header">
                        <span class="turno-fecha">${escapeHtml(fechaStr)}</span>
                        ${horaStr ? `<span class="turno-hora">${escapeHtml(horaStr)}</span>` : ''}
                    </div>
                    <div class="turno-info">
                        <div><div class="turno-info-label">Paciente</div><div>${escapeHtml(fullName || 'N/A')}</div></div>
                        <div><div class="turno-info-label">Profesional</div><div>${escapeHtml(profesionalRow || 'N/A')}</div></div>
                        <div><div class="turno-info-label">Sede</div><div>${escapeHtml(sedeRow || sede)}</div></div>
                        <div><div class="turno-info-label">Tratamiento</div><div>${escapeHtml(tratamiento || 'N/A')}</div></div>
                        <div><div class="turno-info-label">Estado</div><span class="status-badge ${st.cls}">${escapeHtml(st.label)}</span></div>
                    </div>
                    ${actionsHtml}
                </div>`;
        });

        container.innerHTML = cards.join('');
    } catch (e) {
        container.innerHTML = `<div class="no-results" style="color:var(--danger);">Error: ${escapeHtml(e.message)}</div>`;
    } finally {
        _buscandoTurnos = false;
    }
}

// Event delegation para los botones de cada turno
document.getElementById('resultadoTurnos')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    if (action === 'reschedule') {
        abrirReagendamiento(btn.dataset);
    } else if (action === 'cancel') {
        abrirConfirmacionCancelar(btn.dataset);
    }
});

// =============================================
// 6. CANCELAR TURNO
// =============================================
function abrirConfirmacionCancelar(d) {
    document.getElementById('cancelAppointmentId').value = d.eventId || '';
    document.getElementById('cancelDni').value = d.dni || '';
    document.getElementById('cancelFullName').value = d.fullName || '';
    document.getElementById('cancelPhone').value = d.phone || '';
    document.getElementById('cancelTratamiento').value = d.tratamiento || '';
    document.getElementById('cancelCalendarName').value = d.calendarName || '';
    const info = document.getElementById('confirmCancelInfo');
    info.textContent = d.fecha
        ? `Vas a cancelar el turno del ${d.fecha}. Esta acción no se puede deshacer.`
        : 'Esta acción no se puede deshacer.';
    document.getElementById('confirmCancelStatus').textContent = '';
    document.getElementById('confirmCancelModal').classList.add('active');
}

document.getElementById('confirmCancelBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmCancelBtn');
    const status = document.getElementById('confirmCancelStatus');
    const appointmentId = document.getElementById('cancelAppointmentId').value;
    if (!appointmentId) return;

    btn.disabled = true;
    btn.classList.add('btn-loading');
    status.textContent = 'Cancelando...';
    status.style.color = 'var(--primary)';

    try {
        await ghlFetch(`calendars/events/appointments/${appointmentId}`, {
            method: 'PUT',
            body: JSON.stringify({ appointmentStatus: 'cancelled' })
        });

        // Sync interno (best-effort: no bloquea UX si falla)
        const [first_name, ...rest] = (document.getElementById('cancelFullName').value || '').split(' ');
        await fetch('/api/sync-registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'cancel',
                appointmentId,
                DNI: document.getElementById('cancelDni').value,
                first_name: first_name || '',
                last_name: rest.join(' ') || '',
                full_name: document.getElementById('cancelFullName').value,
                phone: document.getElementById('cancelPhone').value,
                Tratamiento: document.getElementById('cancelTratamiento').value,
                calendarName: document.getElementById('cancelCalendarName').value
            })
        }).catch(err => console.warn('[sync-registro cancel]', err));

        cerrarModal('confirmCancelModal');
        document.getElementById('cancelSuccessModal').classList.add('active');
        buscarMisTurnos();
    } catch (e) {
        status.textContent = e.message || 'Error al cancelar.';
        status.style.color = 'var(--danger)';
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
    }
});

// =============================================
// 7. REAGENDAR TURNO
// =============================================
let _rescheduleSlotsMap = {}; // cache de slots de la apertura actual

async function abrirReagendamiento(d) {
    const modal = document.getElementById('rescheduleModal');
    const container = document.getElementById('rescheduleDatePicker');
    const status = document.getElementById('rescheduleStatus');

    // Hidden inputs
    document.getElementById('rescheduleAppointmentId').value = d.eventId || '';
    document.getElementById('rescheduleCalendarId').value = d.calendarId || '';
    document.getElementById('rescheduleCurrentIso').value = d.currentIso || '';
    document.getElementById('rescheduleProfesional').value = d.profesional || '';
    document.getElementById('rescheduleSede').value = d.sede || '';
    document.getElementById('rescheduleDni').value = d.dni || '';
    document.getElementById('rescheduleFullName').value = d.fullName || '';
    document.getElementById('reschedulePhone').value = d.phone || '';
    document.getElementById('rescheduleObraSocial').value = d.obraSocial || '';
    document.getElementById('rescheduleTratamiento').value = d.tratamiento || '';
    document.getElementById('rescheduleCalendarName').value = d.calendarName || '';
    document.getElementById('rescheduleDate').value = '';
    document.getElementById('rescheduleTime').value = '';
    document.getElementById('rescheduleSlotDuration').value = '30';
    document.getElementById('rescheduleTimeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha.</p>';
    status.textContent = '';
    status.className = 'status-msg';

    // Info del turno actual
    const infoEl = document.getElementById('rescheduleCurrentInfo');
    if (d.currentIso) {
        const dt = new Date(d.currentIso);
        const fechaStr = dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
        const horaStr = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
        infoEl.innerHTML = `<strong>Turno actual:</strong> ${escapeHtml(fechaStr)} a las ${escapeHtml(horaStr)} — ${escapeHtml(d.profesional || '')}`;
    } else {
        infoEl.innerHTML = '';
    }

    modal.classList.add('active');
    container.innerHTML = '<p class="placeholder-text" style="margin:auto;">Cargando agenda...</p>';

    const calendarId = d.calendarId;
    if (!calendarId) {
        container.innerHTML = '<p style="color:var(--danger);margin:auto;">No se identificó el calendario del profesional. Contactanos por WhatsApp.</p>';
        return;
    }

    try {
        const tz = TZ;

        // Fetch en paralelo: detalle del calendario (slotDuration) + free-slots (3 meses)
        const [calInfo, slotsData] = await Promise.all([
            ghlFetch(`calendars/${calendarId}`).catch(() => null),
            ghlFetchSlots3Months(calendarId, tz)
        ]);

        const slotDuration = parseInt(
            calInfo?.calendar?.slotDuration ||
            calInfo?.slotDuration ||
            calInfo?.calendar?.slot_duration ||
            30,
            10
        ) || 30;
        document.getElementById('rescheduleSlotDuration').value = String(slotDuration);

        _rescheduleSlotsMap = slotsData;
        renderRescheduleDates(_rescheduleSlotsMap, d.currentIso);
    } catch (e) {
        container.innerHTML = `<p style="color:var(--danger);margin:auto;">Error al cargar agenda: ${escapeHtml(e.message)}</p>`;
    }
}

function renderRescheduleDates(slotsMap, currentIso) {
    const container = document.getElementById('rescheduleDatePicker');
    container.innerHTML = '';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const fechas = Object.keys(slotsMap).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    let hayDias = false;
    const currentDateStr = currentIso ? new Date(currentIso).toISOString().slice(0, 10) : '';

    fechas.forEach(dateStr => {
        const raw = slotsMap[dateStr]?.slots || slotsMap[dateStr];
        if (!Array.isArray(raw) || !raw.length) return;
        hayDias = true;
        const [y, m, dd] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, dd);
        const card = document.createElement('div');
        card.className = 'date-card has-slots';
        if (dateStr === currentDateStr) card.classList.add('is-current-day');
        card.dataset.date = dateStr;
        card.onclick = () => seleccionarFechaReagendar(dateStr, card);
        card.innerHTML = `<span class="day-name">${days[dateObj.getDay()]}</span><span class="day-number">${dd}</span><span class="month-year">${months[dateObj.getMonth()]}</span>`;
        container.appendChild(card);
    });

    if (!hayDias) container.innerHTML = '<p class="placeholder-text" style="margin:auto;">No hay días disponibles.</p>';
}

function seleccionarFechaReagendar(dateStr, cardEl) {
    document.getElementById('rescheduleDate').value = dateStr;
    document.getElementById('rescheduleTime').value = '';
    document.querySelectorAll('#rescheduleDatePicker .date-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    const currentIso = document.getElementById('rescheduleCurrentIso').value;
    const slotsData = _rescheduleSlotsMap[dateStr]?.slots || _rescheduleSlotsMap[dateStr];
    const container = document.getElementById('rescheduleTimeSlotsContainer');
    container.innerHTML = '';

    if (!Array.isArray(slotsData) || !slotsData.length) {
        container.innerHTML = '<p class="placeholder-text">No hay horarios.</p>';
        return;
    }

    const seen = new Set();
    const parsed = [];
    slotsData.forEach(slot => {
        const isoRaw = typeof slot === 'string' ? slot : (slot.startTime || slot);
        const iso = normalizarIsoArt(isoRaw);
        const d = new Date(iso);
        if (isNaN(d.getTime())) return;
        const tv = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
        const key = iso;
        if (seen.has(key)) return;
        seen.add(key);
        parsed.push({ tv, iso, d });
    });
    parsed.sort((a, b) => a.d - b.d);

    if (!parsed.length) {
        container.innerHTML = '<p class="placeholder-text">No hay horarios.</p>';
        return;
    }

    parsed.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'time-slot-btn';
        const isCurrent = currentIso && new Date(currentIso).getTime() === s.d.getTime();
        if (isCurrent) {
            btn.classList.add('is-current');
            btn.title = 'Este es tu horario actual';
        }
        btn.textContent = s.tv + (isCurrent ? ' (actual)' : '');
        btn.onclick = () => {
            if (isCurrent) return; // bloquear selección del horario actual
            container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('rescheduleTime').value = s.iso;
        };
        container.appendChild(btn);
    });
}

document.getElementById('confirmRescheduleBtn')?.addEventListener('click', confirmarReagendamiento);

async function confirmarReagendamiento() {
    const btn = document.getElementById('confirmRescheduleBtn');
    const status = document.getElementById('rescheduleStatus');
    const appointmentId = document.getElementById('rescheduleAppointmentId').value;
    const calendarId = document.getElementById('rescheduleCalendarId').value;
    const startTime = document.getElementById('rescheduleTime').value;
    const currentIso = document.getElementById('rescheduleCurrentIso').value;
    const slotDuration = parseInt(document.getElementById('rescheduleSlotDuration').value, 10) || 30;

    if (!appointmentId || !calendarId) {
        setRescheduleStatus(status, 'Datos del turno incompletos. Cerrá el modal y reintentá.', 'danger');
        return;
    }
    if (!startTime) {
        setRescheduleStatus(status, 'Seleccioná fecha y horario.', 'danger');
        return;
    }
    if (currentIso && new Date(currentIso).getTime() === new Date(startTime).getTime()) {
        setRescheduleStatus(status, 'Ese es tu horario actual. Elegí uno distinto.', 'danger');
        return;
    }

    const startMs = new Date(startTime).getTime();
    const tratamientoReschedule = document.getElementById('rescheduleTratamiento').value || '';
    const duracionCustom = getDuracionMinutos(tratamientoReschedule, document.getElementById('rescheduleProfesional')?.value || '');
    const duracionEfectiva = duracionCustom !== null ? duracionCustom : slotDuration;
    const endTime = new Date(startMs + duracionEfectiva * 60_000).toISOString();

    btn.disabled = true;
    btn.classList.add('btn-loading');
    setRescheduleStatus(status, 'Reagendando...', 'primary');

    try {
        // 1. PUT a GHL — esto libera el slot anterior automáticamente
        await ghlFetch(`calendars/events/appointments/${appointmentId}`, {
            method: 'PUT',
            body: JSON.stringify({ startTime, endTime, calendarId })
        });

        // 2. Sync interno (DB + n8n). Best-effort: no rompe la UX si falla.
        const fullName = document.getElementById('rescheduleFullName').value || '';
        const [first_name, ...rest] = fullName.split(' ');
        const syncRes = await fetch('/api/sync-registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reschedule',
                appointmentId,
                startTime,
                DNI: document.getElementById('rescheduleDni').value,
                first_name: first_name || '',
                last_name: rest.join(' ') || '',
                full_name: fullName,
                phone: document.getElementById('reschedulePhone').value,
                'Obra Social': document.getElementById('rescheduleObraSocial').value,
                Tratamiento: document.getElementById('rescheduleTratamiento').value,
                calendarName: document.getElementById('rescheduleCalendarName').value
            })
        }).catch(err => { console.warn('[sync-registro reschedule]', err); return null; });

        let syncWarning = '';
        if (syncRes && !syncRes.ok && syncRes.status === 207) {
            syncWarning = ' (la sincronía interna puede demorar unos minutos)';
        }

        cerrarModal('rescheduleModal');
        const successInfo = document.getElementById('rescheduleSuccessInfo');
        const newDt = new Date(startTime);
        const fechaStr = newDt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
        const horaStr = newDt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
        if (successInfo) {
            successInfo.textContent = `Tu nuevo turno es el ${fechaStr} a las ${horaStr}.${syncWarning}`;
        }
        document.getElementById('rescheduleSuccessModal').classList.add('active');
        buscarMisTurnos();
    } catch (e) {
        const msg = e.message || '';
        // Detectar conflicto de slot (ya tomado)
        if (/conflict|409|422|not available|unavailable|ocupad/i.test(msg)) {
            setRescheduleStatus(status, 'Ese horario se ocupó. Elegí otro.', 'danger');
            // Recargar slots
            try {
                const tz = TZ;
                _rescheduleSlotsMap = await ghlFetchSlots3Months(calendarId, tz);
                renderRescheduleDates(_rescheduleSlotsMap, currentIso);
                document.getElementById('rescheduleTimeSlotsContainer').innerHTML = '<p class="placeholder-text">Seleccioná una fecha.</p>';
            } catch (_) {}
        } else {
            setRescheduleStatus(status, msg || 'Error al reagendar. Intentá de nuevo.', 'danger');
        }
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
    }
}

function setRescheduleStatus(el, msg, kind) {
    el.textContent = msg;
    el.classList.add('active');
    el.style.color = kind === 'danger' ? 'var(--danger)' : kind === 'primary' ? 'var(--primary)' : 'var(--success)';
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

        statusEl.textContent = 'Datos encontrados';
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
// CARGAR TRATAMIENTOS DESDE SUPABASE (por especialidad)
// =============================================
async function cargarTratamientosPorEspecialidad(searchKeys, sede) {
    const hidden = document.getElementById('tratamiento');
    const tSel = document.getElementById('tratamientoSelect');
    const formContainer = document.getElementById('agendarFormContainer');

    resetBookingForm();
    if (tSel) { tSel.innerHTML = '<option value="">Cargando tratamientos...</option>'; tSel.disabled = true; }
    if (hidden) hidden.value = '';
    formContainer.style.display = 'block';
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const sedeNorm = sede.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        // Filtrado client-side sobre el cache con override CSV (no se consulta especialidades a la DB)
        const todos = await getProfesionalesCache();
        especialidadProfesionalesCache = filtrarPorEspecialidad(todos, searchKeys, sedeNorm);

        if (!especialidadProfesionalesCache.length) {
            if (tSel) { tSel.innerHTML = '<option value="">No hay profesionales para esta especialidad en esta sede</option>'; tSel.disabled = true; }
            document.getElementById('datePickerContainer').innerHTML =
                '<p class="placeholder-text" style="margin:auto;">No hay profesionales para esta especialidad en esta sede.</p>';
            return;
        }

        // Tratamientos provienen de la DB (unión deduplicada de todos los profesionales de la especialidad)
        const allTratamientos = [...new Set(
            especialidadProfesionalesCache.flatMap(p => normalizarTratamientos(p.tratamientos))
        )].filter(Boolean);

        if (!allTratamientos.length) {
            if (tSel) { tSel.innerHTML = '<option value="">Sin tratamientos configurados para esta especialidad</option>'; tSel.disabled = true; }
            document.getElementById('datePickerContainer').innerHTML =
                '<p class="placeholder-text" style="margin:auto;">Sin tratamientos disponibles. Contactanos por WhatsApp.</p>';
            return;
        }

        poblarTratamientos(allTratamientos);

        document.getElementById('datePickerContainer').innerHTML =
            '<p class="placeholder-text" style="margin:auto;">Seleccioná un tratamiento para ver disponibilidad.</p>';

    } catch (e) {
        if (tSel) { tSel.innerHTML = '<option value="">Error al cargar tratamientos</option>'; tSel.disabled = true; }
        console.error('[cargarTratamientosPorEspecialidad]', e);
    }
}

// =============================================
// CARGAR SLOTS DESDE LISTA DE PROFESIONALES
// =============================================
async function cargarSlotsDesdeProfs(profs) {
    const dateContainer = document.getElementById('datePickerContainer');
    disponibilidadGlobal = {};
    slotSeleccionado = null;
    document.getElementById('appointmentDate').value = '';
    document.getElementById('appointmentTime').value = '';
    document.getElementById('timeSlotsContainer').innerHTML =
        '<p class="placeholder-text">Seleccioná una fecha para ver horarios.</p>';

    dateContainer.innerHTML = '<p class="placeholder-text" style="margin:auto;">Buscando turnos disponibles...</p>';

    try {
        const tz = TZ;
        const results = await Promise.all(profs.map(async prof => {
            try {
                const merged = await ghlFetchSlots3Months(prof.calendar_id, tz);
                return parsearSlots(merged, prof);
            } catch { return []; }
        }));
        const allSlots = results.flat();
        if (!allSlots.length) {
            dateContainer.innerHTML =
                '<p class="placeholder-text" style="margin:auto;">Sin turnos disponibles en los próximos 3 meses. Contactanos por WhatsApp.</p>';
            return;
        }
        poblarDisponibilidad([allSlots]);
        dibujarTarjetasDeDias(dateContainer);
    } catch (e) {
        dateContainer.innerHTML = `<p style="color:var(--danger);margin:auto;">Error: ${escapeHtml(e.message)}</p>`;
    }
}

// Listener: cuando cambia el tratamiento en modo especialidad, cargar slots del prof que lo ofrece
document.getElementById('tratamiento')?.addEventListener('change', function () {
    if (bookingMode !== 'especialidad') return;
    const tratamientoElegido = this.value;
    if (!tratamientoElegido) {
        document.getElementById('datePickerContainer').innerHTML =
            '<p class="placeholder-text" style="margin:auto;">Seleccioná un tratamiento para ver disponibilidad.</p>';
        return;
    }
    const tratamientoNorm = normStr(tratamientoElegido);
    const profsConTratamiento = especialidadProfesionalesCache.filter(p =>
        normalizarTratamientos(p.tratamientos).some(t => normStr(t) === tratamientoNorm)
    );
    const profsAUsar = profsConTratamiento.length ? profsConTratamiento : especialidadProfesionalesCache;
    if (!profsAUsar.length) {
        document.getElementById('datePickerContainer').innerHTML =
            '<p class="placeholder-text" style="margin:auto;">No hay disponibilidad para ese tratamiento en esta sede. Contactanos por WhatsApp.</p>';
        return;
    }
    cargarSlotsDesdeProfs(profsAUsar);
});

// =============================================
// INIT
// =============================================
initConfig();
