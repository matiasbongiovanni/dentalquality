# Plan de Verificación y Deploy — DentalQuality Landing

**Commit actual:** `0c534e7` (HTML elements fixed)

---

## ✅ Lo que está listo

1. **HTML/JavaScript** — Todos los elementos DOM presentes (commit 0c534e7)
   - Modal de reagendamiento con campos completos
   - Modal de cancelación con campos completos
   - Modales de éxito para ambas operaciones
   
2. **Endpoints API** — Código auditado, sin errores lógicos
   - `GET /api/config` → devuelve SUPABASE_URL + SUPABASE_ANON_KEY
   - `GET/POST/PUT /api/ghl?path=...` → proxy a GHL con allowlist + origin check + rate limit
   - `POST /api/webhook-agendamiento` → forwardea a n8n con HMAC + validation
   - `POST /api/sync-registro` → sincroniza Supabase + n8n (best-effort) + IDOR check
   
3. **Seguridad** — Implementada
   - Origin check en todos los endpoints
   - HMAC signing (hard fail en prod si falta `N8N_WEBHOOK_SECRET`)
   - Service-role key solo en servidor (nunca expuesta al cliente)
   - Validación de DNI y teléfono
   - Rate limiting (60 req/min en GHL, 10 en webhook, 20 en sync)
   - IDOR protection en `/api/sync-registro` (DNI verification)

---

## ❌ Lo que falta — CRÍTICO

### 1. GHL_API_KEY — Regenerar en la sub-cuenta MGV

**Problema:** El token actual no tiene acceso a la sede (location) de la sub-cuenta.

**Solución:**
```
1. Abrir GHL → Settings → Integrations → API Keys
2. Click "+ Add New Key"
3. Seleccionar LOCATION: "MGV" (sub-cuenta, NO agencia)
4. Permisos mínimos: contacts:read, contacts:write, calendars:read, calendars:write
5. Copiar el PIT generado (comienza con "pit-")
6. Guardar en Vercel: vercel env add GHL_API_KEY production
```

### 2. Variables de entorno en Vercel

```bash
vercel env add GHL_API_KEY production        # pit-... (nuevo, desde MGV)
vercel env add SUPABASE_URL production       # https://devsupabase-dentalquality.surovianiasystems.site/rest/v1
vercel env add SUPABASE_ANON_KEY production  # eyJ...
vercel env add SUPABASE_SERVICE_ROLE_KEY production  # eyJ... (service-role)
vercel env add N8N_WEBHOOK_URL production    # https://devn8nwebhook-dentalquality.surovianiasystems.site/webhook/2d3679d0-bf25-445c-ad19-ab7191d32a17
vercel env add N8N_WEBHOOK_SECRET production # [secret desde n8n workflow settings]
vercel env add ALLOWED_ORIGIN production     # https://agendamiento.dentalquality.com.ar
```

---

## 📋 Checklist de Verificación LOCAL

Antes de deployar a prod, ejecutar estos tests locales:

### A. Setup local
```bash
cd dentalquality
cp .env.example .env.local
# Editar .env.local con credenciales reales
npm install
npm run dev  # Arranca test-server en :3000
```

### B. Test: Agendar turno
1. Abrir `http://localhost:3000` en navegador
2. Tab "Agendar" → Seleccionar sede "Lanús" o "Lomas"
3. Click "Por profesional" o "Por especialidad"
4. Verificar que se cargan profesionales/especialidades desde Supabase
5. Seleccionar un profesional/especialidad
6. Elegir fecha y horario (debe cargar disponibilidad desde GHL)
7. Completar datos (DNI: 12345678, nombre, teléfono, obra social)
8. Click "Confirmar Turno"
   - ✅ POST a `/api/webhook-agendamiento` debe retornar 200 OK
   - ✅ n8n debe procesar (revisar logs en https://devn8n-dentalquality.surovianiasystems.site)
   - ✅ Modal de éxito debe aparecer
9. Verificar que el turno se creó en Supabase (tabla `registros`)

### C. Test: Reagendar turno
1. Tab "Ver Turnos"
2. Seleccionar sede
3. Ingresar DNI usado en test A (12345678)
4. Click "Buscar"
5. Debe listar el turno creado
6. Click "Reagendar" en el turno
7. Modal de reagendamiento:
   - ✅ Debe mostrar turno actual
   - ✅ Debe cargar fechas disponibles
   - ✅ Seleccionar nueva fecha → cargar horarios
   - ✅ Elegir nuevo horario
8. Click "Confirmar Reagendamiento"
   - ✅ PUT a GHL debe retornar 200 OK
   - ✅ POST a `/api/sync-registro` debe retornar 200 OK
   - ✅ Modal de éxito
9. Verificar que `registros.fecha_turno` se actualizó en Supabase

### D. Test: Cancelar turno
1. Tab "Ver Turnos" → Buscar DNI
2. Click "Cancelar" en un turno
3. Modal de confirmación aparece
4. Click "Sí, cancelar"
   - ✅ PUT a GHL con `appointmentStatus: 'cancelled'` debe retornar 200 OK
   - ✅ POST a `/api/sync-registro` debe retornar 200 OK
   - ✅ Modal de éxito
5. Verificar que `registros.estado = 'cancelado'` en Supabase

### E. Test: Errores esperados
- **Sin DNI:** "DNI: requerido"
- **Teléfono inválido:** "Teléfono: debe tener al menos 10 dígitos"
- **DNI no encontrado:** "Turno no encontrado"
- **Slot tomado durante reagendamiento:** "Ese horario ya fue tomado. Por favor recargá los disponibles."

### F. Console errors
```
F12 → Console (errors/warnings):
- Debe estar limpia (sin 403, CORS errors, etc.)
- Pueden haber warnings (deprecations), pero no errors
```

---

## 🚀 Pasos para Deploy

Una vez que TODO pasa local:

```bash
# 1. Asegurarse que .env.local está sincronizado con Vercel
vercel env pull  # descarga las vars actuales

# 2. Verificar que están todas las vars críticas
vercel env ls

# 3. Build y preview
vercel --prod

# 4. Post-deploy: Verificar prod
curl https://agendamiento.dentalquality.com.ar/
# Debe retornar HTML de la landing (código 200)

# 5. Test final en prod
# Abrir https://agendamiento.dentalquality.com.ar en navegador
# Repetir checklist B, C, D (al menos flujo de agendar)
```

---

## ⚠️ Rollback (si algo falla en prod)

```bash
# Ver deployments recientes
vercel deployments

# Rollback a la versión anterior
vercel rollback [deployment-id]

# Verificar que revirtió
curl https://agendamiento.dentalquality.com.ar/
```

---

## 📊 Monitoreo post-deploy

- **Logs en Vercel:** `vercel logs dentalquality`
- **Métricas n8n:** https://devn8n-dentalquality.surovianiasystems.site (revisar workflow `FSKDIgrnw0ImNDFL`)
- **Dashboard Supabase:** Verificar que `registros` crece después de agendar
- **Alertas:** n8n manda email a `mateo.suarezross8@gmail.com, matiasweschta@gmail.com` si hay error

---

**Status actual:** Listo para verificación local
**Bloqueador:** GHL_API_KEY (debe regenerarse en MGV)
**ETA Deploy:** ~30 min después de resolver credenciales
