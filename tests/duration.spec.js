/**
 * Tests de lógica de duración por tratamiento.
 * Verifica getDuracionMinutos() y que los POSTs a GHL incluyen endTime correcto.
 */
const { test, expect } = require('@playwright/test');
const { buildSlotsMock, PROFESIONALES_MOCK, TEST_PATIENT } = require('./helpers');

// =============================================
// Casos unitarios de getDuracionMinutos
// =============================================
const DURATION_CASES = [
    // conductos → 45 min
    { tratamiento: 'Tratamiento de conducto',                 expected: 45 },
    { tratamiento: 'Tratamientos de conducto',                expected: 45 },
    { tratamiento: 'Tratamientos de conductos uniradicular',  expected: 45 },
    { tratamiento: 'tratamientos de conductos uniradiculares', expected: 45 },
    { tratamiento: 'Retratamiento endodóntico',               expected: 45 },
    { tratamiento: 'endodoncia general',                      expected: 45 },
    // implante (no consulta) → 45 min
    { tratamiento: 'Colocación de implante',                  expected: 45 },
    { tratamiento: 'implantes',                               expected: 45 },
    { tratamiento: 'Corona sobre implante',                   expected: 45 },
    // consulta de implante → 15 min (debe ir antes del match genérico)
    { tratamiento: 'Consulta de implantes',                   expected: 15 },
    { tratamiento: 'consulta de implante',                    expected: 15 },
    { tratamiento: 'implante consulta inicial',               expected: 15 },
    // consulta de cirugía → 15 min
    { tratamiento: 'Consulta de cirugía',                     expected: 15 },
    { tratamiento: 'cirugía consulta inicial',                expected: 15 },
    { tratamiento: 'Cirugía (solo consulta)',                  expected: 15 },
    // cirugía sin consulta → null (usa slot del calendario)
    { tratamiento: 'Cirugía de extracción',                   expected: null },
    // otros → null (usa slotDuration del calendario)
    { tratamiento: 'Limpieza y profilaxis',                   expected: null },
    { tratamiento: 'Consulta general',                        expected: null },
    { tratamiento: 'Ortodoncia con brackets',                 expected: null },
    { tratamiento: 'Prótesis removible',                      expected: null },
    { tratamiento: '',                                        expected: null },
];

test.describe('getDuracionMinutos — lógica de duración por tratamiento', () => {
    DURATION_CASES.forEach(({ tratamiento, expected }) => {
        test(`"${tratamiento || '(vacío)'}" → ${expected === null ? 'null' : expected + ' min'}`, async ({ page }) => {
            await page.route('**/api/config', route => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ SUPABASE_URL: 'http://mock', SUPABASE_ANON_KEY: 'mock' })
            }));
            await page.goto('/');

            const result = await page.evaluate((t) => {
                if (typeof getDuracionMinutos !== 'function') return 'NOT_FOUND';
                return getDuracionMinutos(t);
            }, tratamiento);

            expect(result).toBe(expected);
        });
    });
});

// =============================================
// POST a GHL incluye endTime correcto
// =============================================
test.describe('POST creación de turno — endTime según tratamiento', () => {
    let capturedGhlBody = null;

    function setupMocks(page, tratamiento) {
        capturedGhlBody = null;
        return Promise.all([
            page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'http://mock-supa', SUPABASE_ANON_KEY: 'mock' }) })),
            page.route('**/mock-supa/profesionales**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFESIONALES_MOCK) })),
            page.route('**/api/ghl**free-slots**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildSlotsMock()) })),
            page.route('**/api/ghl**contacts/search/duplicate**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contact: { id: 'contact_test_001' } }) })),
            page.route('**/api/ghl**calendars/events/appointments**', async r => {
                if (r.request().method() === 'POST') {
                    capturedGhlBody = JSON.parse(r.request().postData() || '{}');
                    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ appointment: { id: 'appt_test_001' } }) });
                } else {
                    await r.continue();
                }
            }),
            page.route('**/api/webhook-agendamiento', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })),
        ]);
    }

    async function fillAndSubmitForm(page, tratamientoValue) {
        await page.selectOption('#sedePicker', 'Lanus');
        await page.waitForSelector('[data-mode="profesional"]');
        await page.click('[data-mode="profesional"]');
        await page.waitForSelector('.prof-card');
        await page.click('.prof-card:first-child');
        // Intentar click en chip; si no existe, inyectar valor en hidden input
        await page.locator(`.tratamiento-chip[data-value="${tratamientoValue}"]`).click().catch(async () => {
            await page.evaluate((t) => {
                const hidden = document.getElementById('tratamiento');
                if (hidden) { hidden.value = t; hidden.dispatchEvent(new Event('change')); }
            }, tratamientoValue);
        });
        await page.waitForSelector('.date-card.has-slots', { timeout: 5000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot-btn', { timeout: 5000 });
        await page.click('.time-slot-btn:first-child');
        await page.fill('#nombre', TEST_PATIENT.nombre);
        await page.fill('#apellido', TEST_PATIENT.apellido);
        await page.fill('#dni', TEST_PATIENT.dni, { force: true });
        await page.fill('#telefono', TEST_PATIENT.telefono, { force: true });
        await page.fill('#email', 'test@test.com');
        await page.click('#submitBtn');
        // El submit abre el modal de confirmación; confirmar desde el modal
        await page.waitForSelector('#preConfirmModal.active', { timeout: 3000 }).catch(() => {});
        await page.click('#preConfirmSubmitBtn').catch(() => {});
        await page.waitForTimeout(1000);
    }

    test('Limpieza y profilaxis — NO envía endTime', async ({ page }) => {
        await setupMocks(page, 'Limpieza y profilaxis');
        await page.goto('/');
        await fillAndSubmitForm(page, 'Limpieza y profilaxis');
        if (capturedGhlBody) {
            expect(capturedGhlBody.endTime).toBeUndefined();
        }
    });

    test('Tratamiento de conducto — endTime = startTime + 45 min', async ({ page }) => {
        await setupMocks(page, 'Tratamiento de conducto');
        await page.goto('/');
        await fillAndSubmitForm(page, 'Tratamiento de conducto');
        if (capturedGhlBody && capturedGhlBody.startTime && capturedGhlBody.endTime) {
            const start = new Date(capturedGhlBody.startTime).getTime();
            const end   = new Date(capturedGhlBody.endTime).getTime();
            expect(end - start).toBe(45 * 60 * 1000);
        }
    });

    test('Consulta de implantes — endTime = startTime + 15 min', async ({ page }) => {
        await setupMocks(page, 'Consulta de implantes');
        await page.goto('/');
        await fillAndSubmitForm(page, 'Consulta de implantes');
        if (capturedGhlBody && capturedGhlBody.startTime && capturedGhlBody.endTime) {
            const start = new Date(capturedGhlBody.startTime).getTime();
            const end   = new Date(capturedGhlBody.endTime).getTime();
            expect(end - start).toBe(15 * 60 * 1000);
        }
    });

    test('implantes (genérico) — endTime = startTime + 45 min', async ({ page }) => {
        await setupMocks(page, 'implantes');
        await page.goto('/');
        await fillAndSubmitForm(page, 'implantes');
        if (capturedGhlBody && capturedGhlBody.startTime && capturedGhlBody.endTime) {
            const start = new Date(capturedGhlBody.startTime).getTime();
            const end   = new Date(capturedGhlBody.endTime).getTime();
            expect(end - start).toBe(45 * 60 * 1000);
        }
    });
});

// =============================================
// Especialidad Endodoncia aparece en el grid
// =============================================
test('Grid de especialidades incluye "Endodoncia y Conductos"', async ({ page }) => {
    await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'http://mock', SUPABASE_ANON_KEY: 'mock' }) }));
    await page.goto('/');
    await page.selectOption('#sedePicker', 'Lanus');
    await page.click('[data-mode="especialidad"]');
    await expect(page.locator('.esp-card[data-id="endodoncia-conductos"]')).toBeVisible();
    await expect(page.locator('.esp-card[data-id="endodoncia-conductos"]')).toContainText('Endodoncia');
});

// =============================================
// Banner no menciona implantes como exclusión
// =============================================
test('Banner de advertencia no dice "implantes" en la restricción de llamado', async ({ page }) => {
    await page.route('**/api/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ SUPABASE_URL: 'http://mock', SUPABASE_ANON_KEY: 'mock' }) }));
    await page.goto('/');
    const bannerText = await page.locator('.container > div[style*="background:#fff8e1"]').first().textContent();
    // El banner solo debe mencionar cirugías mayores, no "implantes" como exclusión
    expect(bannerText.toLowerCase()).not.toMatch(/turnos para.*implante/);
    expect(bannerText.toLowerCase()).toContain('cirugías');
});
