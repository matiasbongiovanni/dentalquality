# Checklist de Verificación — DentalQuality Landing

## 1. Credenciales y Configuración
- [ ] **GHL_API_KEY** — Private Integration Token generado EN LA SUB-CUENTA MGV (no agencia)
  - Verificar que el token tiene permisos: `contacts:read`, `contacts:write`, `calendars:read`
  - El error actual indica que el token no tiene acceso a la sede (location). Regenerar dentro de MGV.
  
- [ ] **SUPABASE_URL** y **SUPABASE_ANON_KEY** — configuradas en Vercel (o .env local)
  - Verificar que la tabla `profesionales` existe y tiene datos
  - Verificar que la tabla `registros` existe
  - Verificar RLS si está habilitado
  
- [ ] **N8N_WEBHOOK_URL** — webhook prod del workflow `FSKDIgrnw0ImNDFL`
  - URL: `https://devn8nwebhook-dentalquality.surovianiasystems.site/webhook/2d3679d0-bf25-445c-ad19-ab7191d32a17`
  - Verificar que el workflow está activo y escucha POST

- [ ] **SUPABASE_SERVICE_ROLE_KEY** — requerida para `/api/sync-registro` (server-side)

## 2. HTML/JavaScript
- [ ] Todos los elementos DOM existen (completado en commit 0c534e7)
  - ✅ rescheduleModal campos completos
  - ✅ confirmCancelModal campos completos
  - ✅ Modales de éxito agregadas
  
## 3. Endpoints API
- [ ] `GET /api/config` — devuelve SUPABASE_URL + SUPABASE_ANON_KEY
- [ ] `GET /api/ghl?path=calendars/...` — proxy a GHL funcionando
- [ ] `POST /api/webhook-agendamiento` — forwardea a n8n con HMAC
- [ ] `POST /api/sync-registro` — sincroniza Supabase (reagendar/cancelar)

## 4. Flujos de Usuario
- [ ] **Agendar turno**
  1. Seleccionar sede
  2. Elegir modo (profesional o especialidad)
  3. Cargar profesionales/especialidades desde Supabase
  4. Seleccionar fecha/hora disponible desde GHL
  5. Completar datos (DNI, nombre, teléfono, obra social)
  6. Submit → POST `/api/webhook-agendamiento` → n8n actualiza GHL
  7. Modal de éxito
  
- [ ] **Ver/Reagendar turno**
  1. Buscar turno por DNI + sede
  2. Listar turnos desde Supabase
  3. Click "Reagendar" → modal con fechas/horarios disponibles
  4. Seleccionar nueva fecha/hora
  5. PUT `/calendars/events/appointments/{id}` en GHL
  6. POST `/api/sync-registro` con `action: "reschedule"`
  7. Modal de éxito
  
- [ ] **Cancelar turno**
  1. Click "Cancelar" en turno
  2. Confirmar en modal
  3. PUT `/calendars/events/appointments/{id}` con `appointmentStatus: 'cancelled'`
  4. POST `/api/sync-registro` con `action: "cancel"`
  5. Modal de éxito

## 5. Seguridad
- [ ] CORS origen permitido: `https://agendamiento.dentalquality.com.ar`
- [ ] Origin check en `/api/config`, `/api/webhook-agendamiento`, `/api/sync-registro`
- [ ] HMAC signing en `/api/webhook-agendamiento` (N8N_WEBHOOK_SECRET)
- [ ] Service-role key NO expuesta en cliente (solo en servidor)
- [ ] DNI validado (no todos dígitos iguales, min 6 dígitos)
- [ ] Phone validado (min 10 dígitos)

---

## Próximos pasos

1. **CRÍTICO:** Regenerar GHL_API_KEY dentro de la sub-cuenta MGV
   ```bash
   # En GHL → Settings → Integrations → API Keys → + Add
   # Seleccionar LOCATION: MGV (sub-cuenta, no agencia)
   # Permisos: contacts, calendars
   # Copiar el PIT generado
   ```

2. Crear `.env.local` o configurar en Vercel:
   ```env
   GHL_API_KEY=pit-[nuevo-token-desde-mgv]
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   N8N_WEBHOOK_URL=https://devn8nwebhook-dentalquality.surovianiasystems.site/webhook/2d3679d0-bf25-445c-ad19-ab7191d32a17
   N8N_WEBHOOK_SECRET=[secret-hmac-de-n8n]
   ALLOWED_ORIGIN=https://agendamiento.dentalquality.com.ar
   ```

3. Ejecutar servidor local y probar cada flujo

4. Si TODO pasa → `vercel --prod`

