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
VITE_CLOUDFLARE_IMAGES_DELIVERY_URL=
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
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_IMAGES_API_TOKEN=
CLOUDFLARE_ACCOUNT_HASH=
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
- `cloudflare-upload-image`
- `cloudflare-delete-image`
- `create-review`

Las funciones sensibles usan service role desde Supabase Edge Functions. No debe haber inserciones publicas directas en `customers`, `bookings`, `payments` o `reviews`.

## Reglas De Reservas

- `create-booking` es la unica entrada publica para crear reservas.
- El cliente no envia precios finales ni estados.
- PayPal cobra el total completo de `total_snapshot`.
- WhatsApp deja `payment_status = pending` y `booking_status = pending_payment`.
- Pay on tour day deja `payment_status = not_required_yet` y `booking_status = pending_confirmation`.
- La doble reserva se bloquea en PostgreSQL con indice unico parcial en `availability_blocks(boat_id, tour_date, time_slot_id)`.
- Las reservas PayPal pendientes pueden expirar mediante `expire_pending_paypal_bookings()`.

## Cloudflare Images

- Upload y delete exigen bearer token Supabase.
- Solo perfiles activos `admin` o `editor`.
- No se acepta un rol enviado por body.
- Se valida MIME, firma del archivo, tamano, recurso asociado y referencias antes de eliminar.
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
