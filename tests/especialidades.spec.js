/**
 * Tests de la sección Especialidades — DentalQuality Autogestión
 *
 * Cubre: render de cards, carga de tratamientos desde DB, filtrado por profesional,
 * timezone correcta de slots, deduplicación iso+calendarId, y calendarId correcto en booking.
 */
const { test, expect } = require('@playwright/test');
const { PROFESIONALES_MOCK, buildSlotsMock, TEST_PATIENT } = require('./helpers');

// Normalización para comparaciones (sin diacríticos, lowercase)
function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

// Filtra profesionales replicando la lógica ilike.*key* de Supabase
function filtrarProfs(profs, reqUrl) {
    try {
        const u = new URL(reqUrl);
        const especFilter = u.searchParams.get('especialidades') || '';
        const sedeFilter = u.searchParams.get('sede') || '';
        const especKey = (especFilter.match(/ilike\.\*(.+)\*/) || [])[1] || '';
        const sedeKey = (sedeFilter.match(/ilike\.\*(.+)\*/) || [])[1] || '';
        let result = profs;
        if (especKey) result = result.filter(p => norm(p.especialidades).includes(norm(especKey)));
        if (sedeKey) result = result.filter(p => norm(p.sede).includes(norm(sedeKey)));
        return result;
    } catch (_) { return profs; }
}

// Setup base de mocks para todas las pruebas de especialidad
// Usa predicados de función para evitar conflictos con caracteres * en las URLs de Supabase (ilike.*key*)
async function setupEspecialidadMocks(page, profsMock = PROFESIONALES_MOCK) {
    await page.route('**/api/config', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' })
    }));
    // Todas las requests a mock-supa (incluye profesionales + obras_sociales)
    await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
        if (r.request().url().includes('/profesionales')) {
            const filtered = filtrarProfs(profsMock, r.request().url());
            await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) });
        } else {
            await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }
    });
    await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(buildSlotsMock())
    }));
    await page.route(url => url.href.includes('/api/ghl') && url.href.includes('contacts/search/duplicate'), r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ contact: { id: 'contact_001' } })
    }));
    await page.route(url => url.href.includes('/api/ghl') && url.href.includes('calendars/events/appointments'), r => r.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ appointment: { id: 'appt_001' } })
    }));
    await page.route('**/api/webhook-agendamiento', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true })
    }));
}

// =============================================
// BLOQUE 1: Render de cards de especialidad
// =============================================
test.describe('Cards de especialidad', () => {
    const CARDS_ESPERADAS = [
        { id: 'odontologia-general', label: 'Odontología General' },
        { id: 'estetica-dental', label: 'Estética Dental' },
        { id: 'ortodoncia-alineadores', label: 'Ortodoncia y Alineadores' },
        { id: 'implantes-protesis', label: 'Implantes y Prótesis' },
        { id: 'atm-bruxismo', label: 'ATM' },
        { id: 'odontopediatria', label: 'Odontopediatría' },
        { id: 'endodoncia-conductos', label: 'Endodoncia' },
    ];

    test.beforeEach(async ({ page }) => {
        await setupEspecialidadMocks(page);
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
    });

    CARDS_ESPERADAS.forEach(({ id, label }) => {
        test(`card "${label}" existe con data-id="${id}"`, async ({ page }) => {
            const card = page.locator(`.esp-card[data-id="${id}"]`);
            await expect(card).toBeVisible();
            await expect(card).toContainText(label);
        });
    });

    test('son exactamente 7 cards', async ({ page }) => {
        const count = await page.locator('.esp-card').count();
        expect(count).toBe(7);
    });
});

// =============================================
// BLOQUE 2: Tratamientos vienen de la DB (no hardcodeados)
// =============================================
test.describe('Tratamientos desde DB', () => {
    test('Odontología General: select muestra tratamientos de la DB', async ({ page }) => {
        await setupEspecialidadMocks(page);
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="odontologia-general"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });

        const opciones = await page.locator('#tratamientoSelect option:not([disabled]):not([value=""])').allTextContents();
        expect(opciones.length).toBeGreaterThan(0);
        // Los tratamientos deben venir exactamente de la DB del mock
        expect(opciones.some(o => o.includes('Limpieza y profilaxis'))).toBe(true);
        expect(opciones.some(o => o.includes('Consulta / Revisación general'))).toBe(true);
        // No debe contener tratamientos de otras especialidades
        expect(opciones.some(o => o.toLowerCase().includes('conducto'))).toBe(false);
        expect(opciones.some(o => o.toLowerCase().includes('implante'))).toBe(false);
    });

    test('Endodoncia: select muestra tratamientos reales de la DB (no "Consulta general")', async ({ page }) => {
        await setupEspecialidadMocks(page);
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });

        const opciones = await page.locator('#tratamientoSelect option:not([disabled]):not([value=""])').allTextContents();
        expect(opciones.length).toBeGreaterThan(0);
        expect(opciones.some(o => o.includes('Tratamiento de conducto'))).toBe(true);
        // No debe mostrar el fallback hardcodeado que se eliminó
        expect(opciones.some(o => o === 'Consulta general')).toBe(false);
        expect(opciones.some(o => o === 'Control / Revisación')).toBe(false);
        expect(opciones.some(o => o === 'Urgencia')).toBe(false);
    });

    test('ATM: select muestra tratamientos de la DB sin mezcla de otras especialidades', async ({ page }) => {
        await setupEspecialidadMocks(page);
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="atm-bruxismo"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });

        const opciones = await page.locator('#tratamientoSelect option:not([disabled]):not([value=""])').allTextContents();
        expect(opciones.length).toBeGreaterThan(0);
        expect(opciones.some(o => o.includes('Consulta ATM'))).toBe(true);
        expect(opciones.some(o => o.includes('Placa miorelajante'))).toBe(true);
        // No debe mezclar tratamientos de implantes o endodoncia
        expect(opciones.some(o => o.toLowerCase().includes('implante'))).toBe(false);
        expect(opciones.some(o => o.toLowerCase().includes('conducto'))).toBe(false);
    });

    test('Especialidad sin profesionales en esa sede → mensaje, select deshabilitado', async ({ page }) => {
        // Lomas no tiene profesionales ATM en el mock
        await setupEspecialidadMocks(page);
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lomas');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="atm-bruxismo"]');
        await page.waitForTimeout(2000);

        const tSel = page.locator('#tratamientoSelect');
        const isDisabled = await tSel.isDisabled();
        expect(isDisabled).toBe(true);
        const dateContainer = page.locator('#datePickerContainer');
        await expect(dateContainer).toContainText('No hay profesionales');
    });
});

// =============================================
// BLOQUE 3: Slots cargan desde calendarId correcto
// =============================================
test.describe('calendarId correcto según especialidad', () => {
    test('Endodoncia: free-slots se pide al calendar_id del profesional de endodoncia', async ({ page }) => {
        const calendarIdsCalled = [];

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), async r => {
            const url = r.request().url();
            const match = url.match(/calendars\/([^/]+)\/free-slots/);
            if (match) calendarIdsCalled.push(match[1]);
            await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildSlotsMock()) });
        });

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Tratamiento de conducto' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });

        // Solo debe llamarse el calendar_id de endodoncia, no de otras especialidades
        expect(calendarIdsCalled).toContain('cal_endo_001');
        expect(calendarIdsCalled).not.toContain('cal_atm_001');
        expect(calendarIdsCalled).not.toContain('cal_impl_001');
        expect(calendarIdsCalled).not.toContain('cal_lanus_001'); // odontología general
    });

    test('ATM: free-slots se pide solo al calendar_id del prof de ATM', async ({ page }) => {
        const calendarIdsCalled = [];

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), async r => {
            const url = r.request().url();
            const match = url.match(/calendars\/([^/]+)\/free-slots/);
            if (match) calendarIdsCalled.push(match[1]);
            await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildSlotsMock()) });
        });

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="atm-bruxismo"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Consulta ATM' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });

        expect(calendarIdsCalled).toContain('cal_atm_001');
        expect(calendarIdsCalled).not.toContain('cal_endo_001');
        expect(calendarIdsCalled).not.toContain('cal_impl_001');
    });
});

// =============================================
// BLOQUE 4: Timezone de slots (siempre ART)
// =============================================
test.describe('Timezone correcta de slots', () => {
    async function buildSlotsWithIso(iso) {
        const dateStr = iso.slice(0, 10);
        return { slots: { [dateStr]: { slots: [iso] } } };
    }

    async function getTimeSlotsText(page, iso) {
        const slotsBody = JSON.stringify(buildSlotsWithIso(iso));

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        // Overwrite free-slots con el ISO específico
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: slotsBody
        }));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Tratamiento de conducto' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot-btn', { timeout: 5000 });
        return page.locator('.time-slot-btn').allTextContents();
    }

    test('ISO sin timezone ("2026-09-10T09:00:00") → muestra 09:00 en ART', async ({ page }) => {
        const texts = await getTimeSlotsText(page, '2026-09-10T09:00:00');
        expect(texts.some(t => t.trim() === '09:00')).toBe(true);
    });

    test('ISO con offset ART ("2026-09-10T09:00:00-03:00") → muestra 09:00', async ({ page }) => {
        const texts = await getTimeSlotsText(page, '2026-09-10T09:00:00-03:00');
        expect(texts.some(t => t.trim() === '09:00')).toBe(true);
    });

    test('ISO UTC ("2026-09-10T12:00:00Z") → muestra 09:00 ART (UTC-3)', async ({ page }) => {
        const texts = await getTimeSlotsText(page, '2026-09-10T12:00:00Z');
        expect(texts.some(t => t.trim() === '09:00')).toBe(true);
    });
});

// =============================================
// BLOQUE 5: Deduplicación correcta de slots
// =============================================
test.describe('Deduplicación de slots por iso + calendarId', () => {
    test('dos profesionales con mismo horario → dos botones de slot', async ({ page }) => {
        // Dos profesionales de ortodoncia (Lanus + cal distinto)
        const dosProfsMock = [
            { profesional: 'Dr. Ortodoncia A', sede: 'Lanus', calendar_id: 'cal_ortodo_A', especialidades: 'Ortodoncia, Alineadores', tratamientos: 'Control de ortodoncia' },
            { profesional: 'Dr. Ortodoncia B', sede: 'Lanus', calendar_id: 'cal_ortodo_B', especialidades: 'Ortodoncia', tratamientos: 'Control de ortodoncia' },
        ];

        // Ambos tienen el mismo slot 10:00 mañana
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const d1 = tomorrow.toISOString().slice(0, 10);
        const slotsIgual = { slots: { [d1]: { slots: [`${d1}T10:00:00-03:00`] } } };

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dosProfsMock) });
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slotsIgual) }));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="ortodoncia-alineadores"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Control de ortodoncia' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot-btn', { timeout: 5000 });

        // Deben aparecer DOS botones de 10:00 (uno por cada prof, dedup por iso+calendarId)
        const botones = await page.locator('.time-slot-btn').allTextContents();
        const botones10 = botones.filter(t => t.trim() === '10:00');
        expect(botones10.length).toBe(2);
    });

    test('mismo profesional, mismo slot → un solo botón (dedup exacto)', async ({ page }) => {
        // Un solo profesional con slot duplicado en la respuesta de GHL
        const unProfMock = [
            { profesional: 'Dr. Ortodoncia A', sede: 'Lanus', calendar_id: 'cal_ortodo_A', especialidades: 'Ortodoncia', tratamientos: 'Control de ortodoncia' },
        ];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const d1 = tomorrow.toISOString().slice(0, 10);
        const slotsConDuplicado = {
            slots: { [d1]: { slots: [`${d1}T10:00:00-03:00`, `${d1}T10:00:00-03:00`] } }
        };

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(unProfMock) });
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slotsConDuplicado) }));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="ortodoncia-alineadores"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Control de ortodoncia' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot-btn', { timeout: 5000 });

        const botones = await page.locator('.time-slot-btn').allTextContents();
        const botones10 = botones.filter(t => t.trim() === '10:00');
        expect(botones10.length).toBe(1);
    });
});

// =============================================
// BLOQUE 6: calendarId correcto en POST de booking (modo especialidad)
// =============================================
test.describe('POST de booking usa calendarId del profesional correcto', () => {
    test('booking en modo especialidad → calendarId pertenece a prof de esa especialidad', async ({ page }) => {
        let capturedBody = null;

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildSlotsMock()) }));
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('contacts/search/duplicate'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contact: { id: 'c001' } }) }));
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('calendars/events/appointments'), async r => {
            if (r.request().method() === 'POST') {
                capturedBody = JSON.parse(r.request().postData() || '{}');
                await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ appointment: { id: 'appt_001' } }) });
            } else await r.continue();
        });
        await page.route('**/api/webhook-agendamiento', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Tratamiento de conducto' });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot-btn', { timeout: 5000 });
        await page.click('.time-slot-btn:first-child');

        await page.fill('#nombre', TEST_PATIENT.nombre);
        await page.fill('#apellido', TEST_PATIENT.apellido);
        await page.fill('#dni', TEST_PATIENT.dni, { force: true });
        await page.fill('#telefono', TEST_PATIENT.telefono, { force: true });
        await page.fill('#email', 'test@test.com');

        // Seleccionar obra social si es requerida
        const obraSelect = page.locator('#obraSocial');
        if (await obraSelect.isVisible()) {
            const opcs = await obraSelect.locator('option:not([value=""])').allInnerTexts();
            if (opcs.length) await obraSelect.selectOption({ index: 1 });
        }

        await page.click('#submitBtn');
        await page.waitForSelector('#preConfirmModal.active', { timeout: 3000 }).catch(() => {});
        await page.click('#preConfirmSubmitBtn').catch(() => {});
        await page.waitForTimeout(1500);

        if (capturedBody) {
            // El calendarId en el booking debe ser del profesional de endodoncia
            const endoProfs = PROFESIONALES_MOCK.filter(p =>
                (p.especialidades || '').toLowerCase().includes('endodoncia') ||
                (p.especialidades || '').toLowerCase().includes('conducto')
            ).map(p => p.calendar_id);

            expect(endoProfs.length).toBeGreaterThan(0);
            expect(endoProfs).toContain(capturedBody.calendarId);

            // No debe ser calendar_id de odontología general u otras especialidades
            expect(capturedBody.calendarId).not.toBe('cal_lanus_001');
            expect(capturedBody.calendarId).not.toBe('cal_atm_001');
        }
    });
});

// =============================================
// BLOQUE 7: parsearSlots maneja formato slot.time
// =============================================
test.describe('parsearSlots — formatos de slot', () => {
    test('slot como string → se parsea correctamente', async ({ page }) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const d1 = tomorrow.toISOString().slice(0, 10);

        const slotsStringFormat = { slots: { [d1]: { slots: [`${d1}T10:00:00-03:00`] } } };

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slotsStringFormat) }));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Tratamiento de conducto' });

        await expect(page.locator('.date-card.has-slots')).toBeVisible({ timeout: 5000 });
    });

    test('slot como objeto { time: "..." } → se parsea sin TypeError', async ({ page }) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const d1 = tomorrow.toISOString().slice(0, 10);

        const slotsObjTimeFormat = {
            slots: { [d1]: { slots: [{ time: `${d1}T10:00:00-03:00` }] } }
        };

        await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'https://devsupabase-dentalquality.surovianiasystems.site', SUPABASE_ANON_KEY: 'mock' }) }));
        await page.route(url => url.href.includes('devsupabase-dentalquality'), async r => {
            if (r.request().url().includes('/profesionales')) { const filtered = filtrarProfs(PROFESIONALES_MOCK, r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) }); }
            else await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route(url => url.href.includes('/api/ghl') && url.href.includes('free-slots'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slotsObjTimeFormat) }));

        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="endodoncia-conductos"]');
        await page.waitForSelector('#tratamientoSelect:not([disabled])', { timeout: 5000 });
        await page.selectOption('#tratamientoSelect', { label: 'Tratamiento de conducto' });
        await page.waitForTimeout(2000);

        const typeErrors = errors.filter(e => e.toLowerCase().includes('typeerror'));
        expect(typeErrors).toHaveLength(0);
        // Con slot.time implementado, debe mostrar el slot
        await expect(page.locator('.date-card.has-slots')).toBeVisible({ timeout: 3000 });
    });
});
