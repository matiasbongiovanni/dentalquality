/**
 * Tests de regresión de seguridad — DentalQuality Autogestión
 * Requiere servidor local corriendo: node test-server.js (o npm run dev)
 * Variables de entorno: TEST_BASE_URL (default: http://localhost:3000)
 *
 * Cómo correr:
 *   npm test tests/security.spec.js
 *   TEST_BASE_URL=http://localhost:3000 npx jest tests/security.spec.js
 */

const fetch = require('node-fetch');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://agendamiento.dentalquality.com.ar';

async function post(path, body, headers = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
}

async function get(path, headers = {}) {
    const res = await fetch(`${BASE}${path}`, { headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
}

describe('Security: Origin enforcement', () => {
    test('/api/webhook-agendamiento rechaza sin Origin', async () => {
        const { status } = await post('/api/webhook-agendamiento', {
            first_name: 'Test', last_name: 'Test', phone: '5491112345678',
            DNI: '12345678', Tratamiento: 'Test',
            calendar: { appointmentId: 'x', calendarName: 'x', startTime: '2026-06-01T10:00:00' }
        });
        expect(status).toBe(403);
    });

    test('/api/sync-registro rechaza sin Origin', async () => {
        const { status } = await post('/api/sync-registro', {
            action: 'cancel', appointmentId: 'x', DNI: '12345678'
        });
        expect(status).toBe(403);
    });

    test('/api/ghl rechaza sin Origin', async () => {
        const { status } = await get('/api/ghl?path=calendars%2Ftest%2Ffree-slots');
        expect(status).toBe(403);
    });
});

describe('Security: IDOR fix en sync-registro', () => {
    const validOrigin = { Origin: ALLOWED_ORIGIN };

    test('rechaza sin DNI', async () => {
        const { status, body } = await post('/api/sync-registro',
            { action: 'cancel', appointmentId: 'fake-id' },
            validOrigin
        );
        expect(status).toBe(400);
        expect(body.errors?.some(e => e.toLowerCase().includes('dni'))).toBe(true);
    });

    test('rechaza con DNI inválido (trivial)', async () => {
        const { status } = await post('/api/sync-registro',
            { action: 'cancel', appointmentId: 'fake-id', DNI: '00000000' },
            validOrigin
        );
        // Puede ser 400 (validación) o 403 (IDOR check si pasa validación)
        expect([400, 403]).toContain(status);
    });

    test('rechaza appointmentId inexistente con DNI válido → 403', async () => {
        const { status } = await post('/api/sync-registro',
            { action: 'cancel', appointmentId: 'nonexistent-id-xyz', DNI: '12345678' },
            validOrigin
        );
        expect(status).toBe(403);
    });
});

describe('Security: Path array injection en ghl proxy', () => {
    const validOrigin = { Origin: ALLOWED_ORIGIN };

    test('path como array retorna 400', async () => {
        const res = await fetch(`${BASE}/api/ghl?path=calendars%2F123&path=free-slots`, {
            headers: validOrigin
        });
        expect(res.status).toBe(400);
    });

    test('path traversal bloqueado por allowlist', async () => {
        const { status } = await get('/api/ghl?path=..%2F..%2Fetc%2Fpasswd', validOrigin);
        expect(status).toBe(403);
    });

    test('path válido pasa allowlist (free-slots)', async () => {
        const { status } = await get(`/api/ghl?path=${encodeURIComponent('calendars/test-cal-id/free-slots')}`, validOrigin);
        // Puede retornar 401/500 (error GHL) pero no 403 de allowlist ni 400 de path
        expect(status).not.toBe(403);
        expect(status).not.toBe(400);
    });
});

describe('Security: Rate limit', () => {
    test('/api/webhook-agendamiento dispara 429 después del límite', async () => {
        const validOrigin = { Origin: ALLOWED_ORIGIN };
        const validPayload = {
            first_name: 'Test', last_name: 'Test', phone: '5491112345678',
            DNI: '12345678', Tratamiento: 'Test',
            calendar: { appointmentId: 'x', calendarName: 'x', startTime: '2026-06-01T10:00:00' }
        };
        let got429 = false;
        // El límite es 10/min; enviamos 15 para asegurar
        for (let i = 0; i < 15; i++) {
            const { status } = await post('/api/webhook-agendamiento', validPayload, validOrigin);
            if (status === 429) { got429 = true; break; }
        }
        expect(got429).toBe(true);
    }, 30000);
});

describe('Security: Validación input', () => {
    const validOrigin = { Origin: ALLOWED_ORIGIN };

    test('phone con 8 dígitos rechazado (AR requiere 10)', async () => {
        const { status, body } = await post('/api/webhook-agendamiento', {
            first_name: 'Test', last_name: 'Test', phone: '12345678', // 8 dígitos
            DNI: '12345678', Tratamiento: 'Consulta',
            calendar: { appointmentId: 'x', calendarName: 'x', startTime: '2026-06-01T10:00:00' }
        }, validOrigin);
        expect(status).toBe(400);
        expect(body.errors?.some(e => e.toLowerCase().includes('phone'))).toBe(true);
    });

    test('DNI todo-ceros rechazado', async () => {
        const { status, body } = await post('/api/webhook-agendamiento', {
            first_name: 'Test', last_name: 'Test', phone: '5491112345678',
            DNI: '00000000', Tratamiento: 'Consulta',
            calendar: { appointmentId: 'x', calendarName: 'x', startTime: '2026-06-01T10:00:00' }
        }, validOrigin);
        expect(status).toBe(400);
        expect(body.errors?.some(e => e.toLowerCase().includes('dni'))).toBe(true);
    });

    test('DNI repetitivo rechazado (11111111)', async () => {
        const { status, body } = await post('/api/webhook-agendamiento', {
            first_name: 'Test', last_name: 'Test', phone: '5491112345678',
            DNI: '11111111', Tratamiento: 'Consulta',
            calendar: { appointmentId: 'x', calendarName: 'x', startTime: '2026-06-01T10:00:00' }
        }, validOrigin);
        expect(status).toBe(400);
        expect(body.errors?.some(e => e.toLowerCase().includes('dni'))).toBe(true);
    });
});
