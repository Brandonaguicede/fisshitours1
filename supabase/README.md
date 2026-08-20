# Supabase Backend Local

Backend Supabase dentro del mismo repo React/Vite. No usa Express, Prisma, Cloudinary ni un proyecto separado.

## Requisitos

- Node.js 20 o superior.
- Docker Desktop abierto y con Docker Engine funcionando.
- Supabase CLI instalado como dependencia del proyecto:

```powershell
npm install supabase --save-dev
npx supabase --version
```

## Flujo Local

Inicializar configuracion local solo si `supabase/config.toml` no existe:

```powershell
npx supabase init
```

Iniciar Supabase local con contenedores administrados por Supabase CLI:

```powershell
npx supabase start
npx supabase status
```

Reconstruir la base local desde cero, aplicar migraciones y ejecutar `seed.sql`:

```powershell
npx supabase db reset --local
```

Este comando destruye solamente los datos de la base local cuando se usa `--local`.

Validar la base:

```powershell
npx supabase db lint --local
```

Generar tipos TypeScript:

```powershell
npx supabase gen types typescript --local > src/types/supabase.ts
```

Detener Supabase local:

```powershell
npx supabase stop
```

## Comandos Remotos Prohibidos En Esta Fase

No ejecutar todavia:

```powershell
npx supabase link
npx supabase db push
npx supabase db reset --linked
```

## Variables Publicas Del Frontend

Estas pueden vivir en `.env` porque son consumidas por Vite:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PAYPAL_CLIENT_ID=
VITE_WHATSAPP_NUMBER=
VITE_TURNSTILE_SITE_KEY=
```

## Secrets Privados De Edge Functions

En produccion deben cargarse con Supabase Secrets, no en codigo:

```env
SUPABASE_SERVICE_ROLE_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_WEBHOOK_ID=
CLOUDFLARE_TURNSTILE_SECRET_KEY=
RATE_LIMIT_HASH_SECRET=
ALLOWED_ORIGIN=
WHATSAPP_NUMBER=
```

Nunca exponer `SUPABASE_SERVICE_ROLE_KEY`, secretos PayPal, Turnstile secret, hash secret de rate limit ni token de Cloudflare en variables `VITE_*`.

## Edge Functions

Estructura actual:

- `create-booking`
- `calculate-booking-price`
- `paypal-create-order`
- `paypal-capture-order`
- `paypal-webhook`
- `storage-upload-image`
- `storage-delete-image`
- `create-review`
- `get-booking-availability`

Las funciones sensibles usan service role desde Supabase Edge Functions. No debe haber inserciones publicas directas en `customers`, `bookings`, `payments` o `reviews`.

### Secrets Locales

Crear `supabase/functions/.env.local` con claves locales de `npx supabase status` y valores falsos para proveedores:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
PAYPAL_CLIENT_ID=test-client
PAYPAL_CLIENT_SECRET=test-secret
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_WEBHOOK_ID=test-webhook
CLOUDFLARE_TURNSTILE_SECRET_KEY=test-turnstile
RATE_LIMIT_HASH_SECRET=local-test-secret-with-sufficient-length
ALLOWED_ORIGIN=http://localhost:5173
WHATSAPP_NUMBER=50600000000
APP_ENV=local
MOCK_EXTERNAL_PROVIDERS=false
BOOKING_RATE_LIMIT_MAX_REQUESTS=8
BOOKING_RATE_LIMIT_WINDOW_MINUTES=15
TURNSTILE_EXPECTED_HOSTNAME=
TURNSTILE_BOOKING_ACTION=booking
TURNSTILE_REVIEW_ACTION=review
```

El archivo queda ignorado por Git mediante `*.local` y `.env.*`. No usar credenciales reales en local.

### Servir Funciones Localmente

```powershell
npx supabase functions serve --env-file supabase/functions/.env.local
```

No usar `--no-verify-jwt` como modo global. Las funciones publicas controladas se invocan con JWT local anon valido. Las funciones administrativas requieren JWT de usuario autenticado y perfil activo con rol `admin` o `editor`.

Nota: Supabase CLI local ignora variables `SUPABASE_*` leidas desde `--env-file`, pero el runtime local las inyecta automaticamente desde el stack.

### Mocks Locales

`MOCK_EXTERNAL_PROVIDERS=true` evita llamadas reales solo cuando `APP_ENV` es `local` o `test` y `SUPABASE_URL` apunta a `127.0.0.1` o `localhost`:

- Turnstile acepta solamente `mock-valid-turnstile`.
- PayPal crea ordenes `MOCK-*`, captura ordenes mock y permite probar estados fallidos por IDs especiales.
- PayPal webhook acepta firma solo si `paypal-transmission-id` es `mock-valid-webhook`.

No habilitar `MOCK_EXTERNAL_PROVIDERS` en Sandbox autorizado ni produccion.

### Tipos De Funcion

Publicas controladas:

- `create-booking`
- `calculate-booking-price`
- `create-review`
- `paypal-webhook`
- `get-booking-availability`

Protegidas:

- `storage-upload-image`
- `storage-delete-image`

PayPal:

- `paypal-create-order`
- `paypal-capture-order`

PayPal siempre usa la reserva guardada y `total_snapshot`; el navegador no controla totales ni estados.

### Pruebas Locales

Validar en este orden:

```powershell
npx supabase db reset --local
npx supabase db lint --local
npm run typecheck
npm run build
```

Para pruebas HTTP, usar `http://127.0.0.1:54321/functions/v1/<function-name>` con `Authorization: Bearer <local anon key>` en funciones publicas. Para Storage, crear un usuario local de Auth, insertar/actualizar su fila en `profiles` con rol `admin` o `editor`, iniciar sesion y usar su access token.

### Frontend Local

El frontend usa solo variables publicas Vite:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key>
VITE_PAYPAL_CLIENT_ID=mock
VITE_WHATSAPP_NUMBER=50600000000
VITE_TURNSTILE_SITE_KEY=
```

No exponer `SUPABASE_SERVICE_ROLE_KEY`, secretos PayPal, tokens Cloudflare ni Turnstile secret en `VITE_*`.

Limitaciones pendientes:

- Pruebas contra PayPal Sandbox real requieren credenciales Sandbox autorizadas.
- Turnstile real requiere site key/secret configurados por dominio.
- El panel admin actualiza `media_assets` y referencias en la base; las paginas publicas del sitio aun consumen datos estaticos en `src/data/`.

## Reglas De Reservas

- `create-booking` es la unica entrada publica para crear reservas.
- El cliente no envia precios finales ni estados.
- PayPal cobra el total completo de `total_snapshot`.
- WhatsApp deja `payment_status = pending` y `booking_status = pending_payment`.
- Pay on tour day deja `payment_status = not_required_yet` y `booking_status = pending_confirmation`.
- La doble reserva se bloquea en PostgreSQL con indice unico parcial en `availability_blocks(boat_id, tour_date, time_slot_id)`.
- Las reservas PayPal pendientes pueden expirar mediante `expire_pending_paypal_bookings()`.

## Supabase Storage

- Upload y delete exigen bearer token Supabase.
- Solo perfiles activos `admin` o `editor`.
- No se acepta un rol enviado por body.
- Se valida MIME, firma binaria (JPEG/PNG/WebP, se rechaza SVG/GIF aunque se declare otro MIME), tamano (max 10 MB), recurso asociado, carpeta permitida y traversal antes de subir o eliminar.
- Las rutas son `<carpeta>/<resource-id>/<uuid>.ext` en el bucket publico `site-images`.
- Una imagen en uso por algun recurso no se puede eliminar (409).
- Las subidas nunca sobrescriben: se crea un asset nuevo y se elimina el anterior solo despues de confirmar la nueva referencia.
- La auditoria se guarda en `audit_log`.

## Reviews

`create-review` es la unica entrada publica para comentarios.

- Valida payload con Zod.
- Exige Cloudflare Turnstile.
- Usa rate limit por IP hasheada con HMAC y `RATE_LIMIT_HASH_SECRET`.
- Fuerza `status = pending`.
- Valida referencias de barco y tour.

## Tests Manuales Recomendados

Despues de `db reset --local`, probar:

1. Crear una reserva PayPal y confirmar `pending_payment`.
2. Repetir `boat_id + tour_date + time_slot_id` y confirmar rechazo por doble reserva.
3. Crear reserva WhatsApp y confirmar que no queda pagada.
4. Crear reserva pay-on-day y confirmar que no queda confirmada.
5. Enviar guests sobre capacidad y confirmar rechazo.
6. Intentar insertar directo como publico en tablas sensibles y confirmar bloqueo por RLS.
