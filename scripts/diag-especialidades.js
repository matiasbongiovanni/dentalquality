#!/usr/bin/env node
/**
 * Diagnóstico de especialidades contra la DB real.
 * Ejecutar: node scripts/diag-especialidades.js
 *
 * Para cada especialidad en ESPECIALIDADES, consulta Supabase con el mismo
 * query que usa el frontend, lista los profesionales encontrados por sede
 * y reporta los tratamientos disponibles en la DB.
 */

const fs = require('fs');
const path = require('path');

// Cargar .env.local
function loadEnv(envPath) {
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach(line => {
        const [key, ...rest] = line.split('=');
        if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    });
}

const root = path.resolve(__dirname, '..');
loadEnv(path.join(root, '.env.local'));
loadEnv(path.join(root, '.env.vercel.prod'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('ERROR: Faltan SUPABASE_URL / SUPABASE_ANON_KEY en .env.local');
    process.exit(1);
}

const SEDES = ['Lanus', 'Lomas'];

// Misma estructura que app.js — sin tratamientos hardcodeados
const ESPECIALIDADES = [
    { id: 'odontologia-general', label: 'Odontología General', searchKey: 'odontolog' },
    { id: 'estetica-dental', label: 'Estética Dental', searchKey: 'stética' },
    { id: 'ortodoncia-alineadores', label: 'Ortodoncia y Alineadores', searchKey: 'ortodon' },
    { id: 'implantes-protesis', label: 'Implantes y Prótesis', searchKeys: ['implant', 'protesis', 'prótesis'] },
    { id: 'atm-bruxismo', label: 'ATM · Bruxismo', searchKey: 'atm' },
    { id: 'odontopediatria', label: 'Odontopediatría', searchKey: 'pediatr' },
    { id: 'endodoncia-conductos', label: 'Endodoncia y Conductos', searchKeys: ['endodoncia', 'conducto'] },
];

async function supaFetch(path) {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    return res.json();
}

function normStr(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function normalizarTratamientos(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (!raw || typeof raw !== 'string') return [];
    return raw.split(/[\n\r,]+/).map(t => t.replace(/^[-\s]+/, '').trim()).filter(t => t.length > 0);
}

async function diagnosticar() {
    console.log(`\n=== DIAGNÓSTICO DE ESPECIALIDADES ===`);
    console.log(`Supabase: ${SUPABASE_URL}`);
    console.log(`Fecha: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}\n`);

    let totalMismatches = 0;

    for (const esp of ESPECIALIDADES) {
        const searchKeys = esp.searchKeys || [esp.searchKey];
        console.log(`\n━━━ ${esp.label} (${esp.id}) ━━━`);
        console.log(`  searchKeys: ${JSON.stringify(searchKeys)}`);

        for (const sede of SEDES) {
            const sedeNorm = normStr(sede);
            console.log(`\n  [${sede}]`);

            const allProfsArrays = await Promise.all(
                searchKeys.map(key =>
                    supaFetch(`/profesionales?select=*&especialidades=ilike.*${encodeURIComponent(key)}*&sede=ilike.*${encodeURIComponent(sedeNorm)}*`)
                        .catch(e => { console.error(`    ERROR query "${key}": ${e.message}`); return []; })
                )
            );

            const seenIds = new Set();
            const profs = allProfsArrays.flat().filter(p => {
                if (seenIds.has(p.calendar_id)) return false;
                seenIds.add(p.calendar_id);
                return true;
            });

            if (!profs.length) {
                console.log(`    (sin profesionales)`);
                continue;
            }

            const allTratamientos = [...new Set(
                profs.flatMap(p => normalizarTratamientos(p.tratamientos))
            )].filter(Boolean);

            profs.forEach(p => {
                const t = normalizarTratamientos(p.tratamientos);
                console.log(`    • ${p.profesional} [${p.calendar_id}]`);
                console.log(`      especialidades DB: ${p.especialidades}`);
                console.log(`      tratamientos DB (${t.length}): ${t.join(' | ')}`);
            });

            console.log(`\n    Tratamientos consolidados para ${sede} (${allTratamientos.length}):`);
            allTratamientos.forEach(t => console.log(`      - "${t}"`));

            if (!allTratamientos.length) {
                console.log(`    [MISMATCH] ⚠️  Sin tratamientos en DB para esta especialidad+sede`);
                totalMismatches++;
            }
        }
    }

    console.log(`\n${'='.repeat(40)}`);
    if (totalMismatches === 0) {
        console.log(`✅ Sin mismatches. Todos los profesionales tienen tratamientos en DB.`);
    } else {
        console.log(`⚠️  ${totalMismatches} combinación(es) con tratamientos vacíos en DB.`);
        console.log(`   Agregar tratamientos en la tabla profesionales de Supabase para esas filas.`);
    }
    console.log();
}

diagnosticar().catch(e => { console.error('ERROR:', e); process.exit(1); });
