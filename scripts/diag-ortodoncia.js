#!/usr/bin/env node
/**
 * Diagnóstico: por qué Ortodoncia no muestra disponibilidad
 * Consulta Supabase + GHL free-slots para cada profesional y reporta la causa raíz.
 *
 * Uso:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=xxx GHL_API_KEY=yyy node scripts/diag-ortodoncia.js
 *
 * O con .env:
 *   node -r dotenv/config scripts/diag-ortodoncia.js
 */

const fetch = require('node-fetch');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const TZ = 'America/Argentina/Buenos_Aires';

const SEDES_A_PROBAR = ['Lanús', 'Lomas', 'Lomas de Zamora', 'Lanus', 'lanus', 'lomas'];
const SEARCH_KEYS = ['ortodon', 'alineador', 'invisalign', 'ortod'];

async function supaQuery(path) {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    return { ok: res.ok, status: res.status, data };
}

async function ghlFreeSlots(calendarId) {
    const now = Date.now();
    const end = now + 30 * 24 * 60 * 60 * 1000;
    const url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${now}&endDate=${end}&timezone=${encodeURIComponent(TZ)}`;
    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${GHL_API_KEY}`,
                'Version': '2021-07-28',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (_) { data = text; }
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function countSlots(raw) {
    const slotsMap = raw?.slots || raw?.data || raw || {};
    if (typeof slotsMap !== 'object') return 0;
    let count = 0;
    Object.values(slotsMap).forEach(dayData => {
        const slots = dayData?.slots || dayData;
        if (Array.isArray(slots)) count += slots.length;
    });
    return count;
}

async function main() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('ERROR: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    if (!GHL_API_KEY) {
        console.warn('ADVERTENCIA: GHL_API_KEY no configurada — solo se consultará Supabase');
    }

    const report = {
        timestamp: new Date().toISOString(),
        hipotesis_confirmada: null,
        sedes: {}
    };

    console.log('\n=== DIAGNÓSTICO ORTODONCIA ===\n');

    // 1. Listar todos los profesionales con cualquier variante de searchKey
    console.log('1. Consultando profesionales con searchKey ortodoncia...');
    for (const key of SEARCH_KEYS) {
        const res = await supaQuery(`/profesionales?select=*&especialidades=ilike.*${encodeURIComponent(key)}*`);
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
            console.log(`   ✓ searchKey '${key}': ${res.data.length} profesional(es) encontrado(s)`);
            res.data.forEach(p => {
                console.log(`     - ID: ${p.id} | Nombre: ${p.profesional} | Sede: "${p.sede}" | calendar_id: ${p.calendar_id}`);
                console.log(`       especialidades raw: "${p.especialidades}"`);
            });
        } else {
            console.log(`   ✗ searchKey '${key}': 0 profesionales`);
        }
    }

    // 2. Probar query exacto del app.js por sede
    console.log('\n2. Probando query exacto de app.js (sede=eq.<sede>)...');
    for (const sede of SEDES_A_PROBAR) {
        const res = await supaQuery(`/profesionales?select=*&especialidades=ilike.*ortodon*&sede=eq.${encodeURIComponent(sede)}`);
        const count = res.ok && Array.isArray(res.data) ? res.data.length : 0;
        console.log(`   sede="${sede}": ${count} profesional(es) | HTTP ${res.status}`);
        if (!report.sedes[sede]) report.sedes[sede] = { profesionales: [], ghl: [] };
        if (count > 0) {
            report.sedes[sede].profesionales = res.data;
        }
    }

    // 3. Probar query con ilike en sede (el fix propuesto)
    console.log('\n3. Probando query con sede=ilike (fix propuesto)...');
    const sedesBase = ['Lanús', 'Lomas'];
    for (const sede of sedesBase) {
        const res = await supaQuery(`/profesionales?select=*&especialidades=ilike.*ortodon*&sede=ilike.*${encodeURIComponent(sede.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())}*`);
        const count = res.ok && Array.isArray(res.data) ? res.data.length : 0;
        console.log(`   sede ilike "${sede}": ${count} profesional(es)`);
    }

    // 4. Para cada profesional encontrado (cualquier match), probar GHL free-slots
    if (GHL_API_KEY) {
        console.log('\n4. Consultando GHL free-slots por calendar_id...');
        const allProfs = [];
        for (const sede of SEDES_A_PROBAR) {
            if (report.sedes[sede]?.profesionales?.length) {
                allProfs.push(...report.sedes[sede].profesionales);
            }
        }
        // También buscar sin filtro de sede
        const allOrtodRes = await supaQuery(`/profesionales?select=*&especialidades=ilike.*ortodon*`);
        if (allOrtodRes.ok && Array.isArray(allOrtodRes.data)) {
            allOrtodRes.data.forEach(p => {
                if (!allProfs.find(x => x.id === p.id)) allProfs.push(p);
            });
        }

        const seen = new Set();
        for (const prof of allProfs) {
            if (!prof.calendar_id || seen.has(prof.calendar_id)) continue;
            seen.add(prof.calendar_id);
            console.log(`\n   Profesional: ${prof.profesional} (${prof.sede})`);
            console.log(`   calendar_id: ${prof.calendar_id}`);
            const ghl = await ghlFreeSlots(prof.calendar_id);
            const slots = ghl.ok ? countSlots(ghl.data) : 0;
            console.log(`   GHL HTTP: ${ghl.status || 'N/A'} | slots próximos 30 días: ${slots}`);
            if (!ghl.ok) console.log(`   GHL error: ${ghl.error || JSON.stringify(ghl.data)}`);
            if (!report.sedes[prof.sede]) report.sedes[prof.sede] = { profesionales: [], ghl: [] };
            report.sedes[prof.sede].ghl.push({ calendar_id: prof.calendar_id, profesional: prof.profesional, slots, ghl_status: ghl.status, ghl_ok: ghl.ok });
        }
    }

    // 5. Diagnóstico causa raíz
    console.log('\n=== DIAGNÓSTICO CAUSA RAÍZ ===');
    const allProfsSupa = await supaQuery(`/profesionales?select=*&especialidades=ilike.*ortodon*`);
    const totalOrtodProfs = allProfsSupa.ok && Array.isArray(allProfsSupa.data) ? allProfsSupa.data.length : 0;

    if (totalOrtodProfs === 0) {
        console.log('CAUSA: Hipótesis 1 confirmada — No hay profesionales con especialidad que contenga "ortodon" en la tabla.');
        console.log('FIX: Verificar cómo está escrita la especialidad en la DB. Ejemplos: "Ortodoncista", "- Ortodoncia"');
        console.log('     Ejecutar: SELECT DISTINCT especialidades FROM profesionales;');
        report.hipotesis_confirmada = 1;
    } else {
        const withSedeMatch = SEDES_A_PROBAR.some(s => report.sedes[s]?.profesionales?.length > 0);
        if (!withSedeMatch) {
            console.log('CAUSA: Hipótesis 3 confirmada — Profesionales existen pero filtro sede=eq.<sede> no matchea.');
            console.log('       El valor de "sede" en DB no coincide exactamente con el que manda el frontend.');
            const valoresSede = allProfsSupa.data?.map(p => `"${p.sede}"`).join(', ');
            console.log(`       Valores de sede en DB: ${valoresSede}`);
            report.hipotesis_confirmada = 3;
        } else {
            const hasSlots = Object.values(report.sedes).some(s => s.ghl?.some(g => g.slots > 0));
            if (!hasSlots && GHL_API_KEY) {
                console.log('CAUSA: Hipótesis 2 o 4 — Profesionales existen y sede matchea, pero GHL no devuelve slots.');
                console.log('       Puede ser: calendar inactivo/archivado en GHL, o sin horarios configurados.');
                report.hipotesis_confirmada = '2_o_4';
            } else if (!GHL_API_KEY) {
                console.log('INFO: No se pudo probar GHL (sin API key). Si la sede matchea, la causa es probablemente 2 o 4.');
                report.hipotesis_confirmada = 'pendiente_ghl';
            } else {
                console.log('INFO: Todo parece OK desde el diagnóstico. Puede ser un problema de timing o caching.');
                report.hipotesis_confirmada = 'ninguna_evidente';
            }
        }
    }

    // Guardar reporte
    const fs = require('fs');
    const outPath = `${__dirname}/../../..`; // salidas/
    const reportPath = `${outPath}/../../salidas/auditorias/2026-05-22-dentalquality-seguridad/diag-ortodoncia-output.json`;
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\nReporte guardado en: ${reportPath}`);
    } catch (_) {
        console.log('\nNo se pudo guardar el reporte JSON — imprimir manualmente.');
        console.log(JSON.stringify(report, null, 2));
    }
}

main().catch(err => { console.error(err); process.exit(1); });
