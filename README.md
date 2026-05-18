# DentalQuality — Landing de Autogestión de Turnos

Landing en HTML/CSS/JS puro deployada en Vercel. Permite a pacientes agendar, reagendar y cancelar turnos dentales, integrada con GoHighLevel (GHL) y el workflow de n8n para persistencia en base de datos.

## Stack

- **Frontend:** HTML / CSS / JS (sin framework)
- **Serverless:** Vercel Serverless Functions (Node.js ≥18)
- **CRM:** GoHighLevel (calendarios, contactos, appointments)
- **DB:** Supabase self-hosted (postgres)
- **Automatización:** n8n — workflow `WEB GHL | AGENDAMIENTOS`

## Flujo de datos

```
Paciente → Landing (index.html)
  1. Carga profesionales/especialidades desde Supabase
  2. Carga disponibilidad de horarios via /api/ghl → GHL Calendar API
  3. Crea contacto en GHL (si no existe) via /api/ghl
  4. Crea appointment en GHL via /api/ghl
  5. POSTea a /api/webhook-agendamiento con el payload del turno
     → /api/webhook-agendamiento valida y reenvía al webhook de n8n
     → n8n actualiza título del appointment en GHL + persiste en Supabase (personas, registros, registro_dashboard)
     → Si n8n falla → rollback: cancela appointment en GHL
```

## Variables de entorno

Copiar `.env.example` a `.env` (desarrollo) o configurar en Vercel dashboard (producción).

| Variable | Descripción |
|---|---|
| `GHL_API_KEY` | Private Integration Token de GoHighLevel |
| `GHL_LOCATION_ID` | ID de la Location en GHL |
| `SUPABASE_URL` | URL REST de Supabase self-hosted |
| `SUPABASE_ANON_KEY` | Anon key de Supabase (pública, protegida por RLS) |
| `N8N_WEBHOOK_URL` | URL del webhook prod de n8n |
| `N8N_WEBHOOK_SECRET` | (Opcional) Secret HMAC para firmar requests al webhook |
| `ALLOWED_ORIGIN` | Dominio de prod para CORS (`https://agendamiento.dentalquality.com.ar`) |

## Setup local

```bash
# 1. Clonar
git clone https://github.com/matiasbongiovanni/dentalquality.git
cd dentalquality

# 2. Copiar env
cp .env.example .env
# Editar .env con los valores reales

# 3. Instalar dependencias
npm install

# 4. Dev con Vercel CLI (recomendado — simula serverless)
npm run dev
# Abre http://localhost:3000

# O bien, levantar proxy Express local + servir static
npm run proxy &
# Abrir index.html directamente en el browser (o con live-server)
```

## Deploy a producción

```bash
# Configurar env vars en Vercel
vercel env add GHL_API_KEY production
vercel env add GHL_LOCATION_ID production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add N8N_WEBHOOK_URL production
vercel env add N8N_WEBHOOK_SECRET production
vercel env add ALLOWED_ORIGIN production

# Deploy
vercel --prod
```

## Probar webhook manualmente

```bash
curl -X POST http://localhost:3000/api/webhook-agendamiento \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Juan",
    "last_name": "Pérez",
    "full_name": "Juan Pérez",
    "phone": "5491155551234",
    "DNI": "12345678",
    "Obra Social": "OSDE",
    "Tratamiento": "Limpieza",
    "calendar": {
      "appointmentId": "TEST-123",
      "calendarName": "Dr. García - Lomas",
      "startTime": "2026-06-01T10:00:00-03:00"
    }
  }'
```

## Probar allowlist del proxy GHL

```bash
# Debe retornar 403
curl "http://localhost:3000/api/ghl?path=contacts/bulk-delete"

# Debe pasar (retorna resultado de GHL)
curl "http://localhost:3000/api/ghl?path=calendars/events/appointments/TEST-ID"
```

## Workflow n8n relacionado

- **Nombre:** `WEB GHL | AGENDAMIENTOS`
- **ID:** `FSKDIgrnw0ImNDFL`
- **Disparador:** Webhook POST con `body.calendar.last_updated_by_meta.source === "Web Agendamiento"`
- **Editor:** https://devn8n-dentalquality.surovianiasystems.site/workflow/FSKDIgrnw0ImNDFL
