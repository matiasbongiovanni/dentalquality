const { test, expect } = require('@playwright/test');
const { PROFESIONALES_MOCK, buildSlotsMock, TEST_PATIENT } = require('./helpers');

// =============================================
// BLOQUE 1: Tests de seguridad (headers + endpoints)
// =============================================

test('CSP headers presentes', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
});

test('/api/config no expone service role key', async ({ request }) => {
    const res = await request.get('/api/config');
    const body = await res.json();
    expect(body).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
    expect(body).not.toHaveProperty('GHL_API_KEY');
    expect(body).not.toHaveProperty('N8N_WEBHOOK_SECRET');
    expect(body.SUPABASE_URL).toBeTruthy();
    expect(body.SUPABASE_ANON_KEY).toBeTruthy();
});

test('/api/config tiene Cache-Control: no-store', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.headers()['cache-control']).toContain('no-store');
});

test('GHL proxy rechaza paths no permitidos', async ({ request }) => {
    const blocked = [
        '/api/ghl?path=users',
        '/api/ghl?path=locations',
        '/api/ghl?path=contacts/search/duplicate/../../../admin',
        '/api/ghl?path=',
    ];
    for (const path of blocked) {
        const res = await request.get(path);
        expect([400, 403]).toContain(res.status());
    }
});

test('GHL proxy solo permite métodos definidos', async ({ request }) => {
    const res = await request.delete('/api/ghl?path=contacts/123');
    expect([403, 405]).toContain(res.status());
});

test('/api/webhook-agendamiento rechaza método GET', async ({ request }) => {
    const res = await request.get('/api/webhook-agendamiento');
    expect(res.status()).toBe(405);
});

test('/api/webhook-agendamiento valida payload incompleto', async ({ request }) => {
    const res = await request.post('/api/webhook-agendamiento', {
        data: { first_name: 'Test' }
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
});

test('XSS: campo DNI solo acepta dígitos', async ({ page }) => {
    await page.route('**/api/config', route => route.fulfill({
        status: 200,
        body: JSON.stringify({ SUPABASE_URL: 'http://mock', SUPABASE_ANON_KEY: 'mock' })
    }));
    await page.goto('/');
    const dniInput = page.locator('#dni');
    await dniInput.fill('<script>alert(1)</script>', { force: true });
    const val = await dniInput.inputValue();
    expect(val).not.toContain('<');
    expect(val).not.toContain('>');
});

test('CORS: /api/ghl rechaza origen no permitido', async ({ request }) => {
    const res = await request.get('/api/ghl?path=calendars/test', {
        headers: { 'Origin': 'https://evil.com' }
    });
    const allowOrigin = res.headers()['access-control-allow-origin'];
    expect(allowOrigin).not.toBe('https://evil.com');
});

// =============================================
// BLOQUE 2: Tests funcionales (mocked)
// =============================================

test.describe('Flujo de agendamiento (mocked)', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/config', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ SUPABASE_URL: 'http://localhost:3001/mock-supa', SUPABASE_ANON_KEY: 'mock' })
        }));
        await page.route('**/mock-supa/profesionales**', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(PROFESIONALES_MOCK)
        }));
        await page.route('**/api/ghl**free-slots**', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(buildSlotsMock())
        }));
    });

    test('Selección de sede muestra opciones de modo', async ({ page }) => {
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await expect(page.locator('#bookingModeSelector')).toBeVisible();
    });

    test('Modo profesional carga cards de profesionales', async ({ page }) => {
        const configDone = page.waitForResponse('**/api/config');
        await page.goto('/');
        await configDone;
        await page.selectOption('#sedePicker', 'Lanus');
        const profsDone = page.waitForResponse('**/mock-supa/profesionales**');
        await page.click('[data-mode="profesional"]');
        await profsDone;
        await expect(page.locator('.prof-card')).toHaveCount(1);
    });

    test('Modo especialidad muestra grid de especialidades', async ({ page }) => {
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="especialidad"]');
        await expect(page.locator('.esp-card')).toHaveCount(6);
    });

    test('DNI con formato inválido no dispara lookup', async ({ page }) => {
        await page.goto('/');
        const dni = page.locator('#dni');
        await dni.fill('123', { force: true });
        await page.evaluate(() => document.getElementById('dni').dispatchEvent(new Event('blur')));
        await expect(page.locator('#dniLookupStatus')).toHaveText('');
    });

    test('DNI válido con 8 dígitos dispara lookup', async ({ page }) => {
        await page.route('**/mock-supa/personas**', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ nombre: 'Matias Bongiovanni', telefono: '5493516000000', obra_social: '' }])
        }));
        const configDone = page.waitForResponse('**/api/config');
        await page.goto('/');
        await configDone;
        const dni = page.locator('#dni');
        await dni.fill('46591162', { force: true });
        await page.evaluate(async () => await window.buscarPacientePorDni('46591162'));
        await expect(page.locator('#nombre')).toHaveValue(/Matias/i);
    });

    test('Formulario requiere todos los campos obligatorios', async ({ page }) => {
        await page.goto('/');
        await page.selectOption('#sedePicker', 'Lanus');
        await page.click('[data-mode="profesional"]');
        await page.evaluate(() => document.getElementById('submitBtn').click());
        await expect(page.locator('#agendarStatus')).not.toHaveText(/ok/i);
    });

    test('Tab "Ver Turnos" muestra error si no hay sede', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="misturnos"]');
        await page.fill('#consultaDNI', '46591162');
        await page.click('button:text("Buscar")');
        await expect(page.locator('#resultadoTurnos')).toContainText(/sede/i);
    });

    test('Tab "Ver Turnos" muestra error si no hay DNI', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="misturnos"]');
        await page.selectOption('#consultaSede', 'Lanus');
        await page.click('button:text("Buscar")');
        await expect(page.locator('#resultadoTurnos')).toContainText(/DNI/i);
    });
});

// =============================================
// BLOQUE 3: E2E real — turno completo (Matias Bongiovanni)
// Solo corre con RUN_REAL_E2E=true y credenciales configuradas
// =============================================

test.describe('E2E real: turno completo para Matias Bongiovanni', () => {
    test.skip(!process.env.RUN_REAL_E2E || process.env.RUN_REAL_E2E !== 'true',
        'Requiere RUN_REAL_E2E=true y credenciales reales en .env.test.local');

    let createdAppointmentId = null;

    test.afterEach(async ({ request }) => {
        if (createdAppointmentId) {
            await request.put(`/api/ghl?path=calendars/events/appointments/${createdAppointmentId}`, {
                data: { appointmentStatus: 'cancelled' }
            });
            console.log(`[CLEANUP] Turno ${createdAppointmentId} cancelado`);
            createdAppointmentId = null;
        }
    });

    test('Agendar turno real para Matias Bongiovanni y cancelarlo', async ({ page, request }) => {
        await page.goto('/');

        await page.selectOption('#sedePicker', 'Lanus');
        await expect(page.locator('#bookingModeSelector')).toBeVisible();

        await page.click('[data-mode="especialidad"]');
        await page.waitForSelector('.esp-card');
        await page.click('.esp-card[data-id="odontologia-general"]');

        await page.waitForSelector('.date-card.has-slots', { timeout: 15000 });
        await page.click('.date-card.has-slots:first-child');
        await page.waitForSelector('.time-slot:not(.is-current):not(.is-past)', { timeout: 5000 });
        await page.click('.time-slot:not(.is-current):not(.is-past):first-child');

        await page.fill('#dni', TEST_PATIENT.dni);
        await page.locator('#dni').blur();
        await page.waitForTimeout(1000);

        if (!(await page.locator('#nombre').inputValue())) {
            await page.fill('#nombre', TEST_PATIENT.nombre);
            await page.fill('#apellido', TEST_PATIENT.apellido);
        }
        await page.fill('#telefono', TEST_PATIENT.telefono);
        await page.selectOption('#tratamiento', { index: 1 });

        page.on('response', async res => {
            if (res.url().includes('calendars/events/appointments') && res.request().method() === 'POST') {
                try {
                    const data = await res.json();
                    createdAppointmentId = data?.appointment?.id || data?.id || null;
                } catch (_) {}
            }
        });

        await page.click('#submitBtn');
        await expect(page.locator('#successModal')).toHaveClass(/active/, { timeout: 15000 });
        console.log(`[TEST] Turno creado: ${createdAppointmentId}`);

        await page.click('[data-tab="misturnos"]');
        await page.selectOption('#consultaSede', 'Lanus');
        await page.fill('#consultaDNI', TEST_PATIENT.dni);
        await page.click('button:text("Buscar")');

        await page.waitForSelector('.turno-card', { timeout: 15000 });
        await expect(page.locator('.turno-card')).toHaveCount({ min: 1 });
    });
});
