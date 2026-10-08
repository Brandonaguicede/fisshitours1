# Configuración operativa: correo y Google Calendar

Este documento no contiene valores secretos. Los secretos viven solo en Supabase (Edge Function secrets) y, para la ruta legacy, en Vercel.

## Cuentas oficiales

| Servicio | Cuenta que lo administra |
| --- | --- |
| Resend (envío de correo, dominio `papagayofishingtourcr.com`, DKIM/SPF/MX) | `papagayofishingtourcr@gmail.com` |
| Google Calendar (calendario de reservas) | `papagayofishingtourcr@gmail.com` |
| Proyecto de Google Cloud con la Service Account | `calendariopapagayo` |
| Buzón operativo (alertas, Reply-To, correo público del sitio) | `reservas@papagayofishingtourcr.com` |

El Gmail es solo la cuenta propietaria de la infraestructura; el código no lo usa como dirección de envío ni de atención.

## Secretos requeridos (Supabase, proyecto `aosrdxjuujlrpatwqiew`)

Correo:
- `RESEND_API_KEY` (clave de solo envío)
- `BOOKING_EMAIL_FROM` — remitente, formato `Nombre <direccion>`
- `BOOKING_ADMIN_EMAIL` — destino de alertas de reserva y del formulario de contacto
- `BOOKING_REPLY_TO` — a dónde llegan las respuestas de los correos de reserva (opcional: si falta o está vacío, no se envía `reply_to`)

Calendar:
- `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID`

Si falta `RESEND_API_KEY`, `BOOKING_EMAIL_FROM` o `BOOKING_ADMIN_EMAIL`, el formulario de contacto responde 500 y no envía nada (no hay direcciones de respaldo en el código).

## Qué función redesplegar al cambiar un secreto

Las Edge Functions leen los secretos al arrancar; tras `supabase secrets set` hay que redesplegar las que los usan.

| Secretos | Funciones |
| --- | --- |
| Correo (`RESEND_API_KEY`, `BOOKING_EMAIL_FROM`, `BOOKING_ADMIN_EMAIL`, `BOOKING_REPLY_TO`) | `create-booking`, `process-booking-emails`, `send-contact-message` |
| Calendar (`GOOGLE_*`) | `sync-reservation-calendar`, `admin-cancel-booking`, `paypal-capture-order`, `paypal-webhook` |

Mantener `verify_jwt` como está en `supabase/config.toml` / el despliegue actual.

## Rotar credenciales

1. Crear la nueva credencial en el servicio (clave de Resend, o clave JSON de la Service Account).
2. Escribirla en un archivo `.env` temporal fuera del repositorio y ejecutar `supabase secrets set --env-file <archivo> --project-ref aosrdxjuujlrpatwqiew`; borrar el archivo de inmediato.
3. Redesplegar las funciones de la tabla anterior.
4. Probar (sección siguiente).
5. Solo después de validar, revocar la credencial anterior y eliminar secretos que ya no se usen.

Nunca subir al repositorio claves, JSON de Service Account ni archivos `.env`.

## Probar el correo

- Formulario de contacto: enviar un mensaje desde `/contact` con un remitente identificado. Debe llegar a `BOOKING_ADMIN_EMAIL` con `Reply-To` igual al correo del visitante.
- Reservas: crear una sola reserva de prueba claramente identificada (cliente con el correo operativo). Debe llegar la alerta de admin (From y Reply-To oficiales); los correos de confirmación salen por el worker `process-booking-emails` (cron cada minuto) y se marcan con `booking_notifications.sent_at`.
- Revisar los encabezados del mensaje recibido (From, Reply-To) y que no aparezcan `onboarding@resend.dev` ni el Gmail antiguo.
- Al terminar, borrar la reserva de prueba y su cliente, bloqueos de disponibilidad, historial y notificaciones (por ID explícito).
- Tests dirigidos: `node --test tests/email-config.test.mjs`.

## Probar Calendar

- Con una Edge Function temporal (o la propia sincronización) crear, leer y borrar un evento de prueba en el calendario `GOOGLE_CALENDAR_ID`, y confirmar que el calendario queda sin eventos de prueba.
- La app solo pide el scope de eventos: no puede leer metadatos ni ACL del calendario.
- Si falla con 403/404: el calendario debe estar compartido con la Service Account con permiso "Realizar cambios en eventos".

## Ruta legacy `api/contact.js` (Vercel)

Ruta heredada: el sitio ya no la llama (el formulario usa la Edge Function `send-contact-message`). Se conserva sin borrar. Si se usara, necesita en Vercel `RESEND_API_KEY`, `CONTACT_EMAIL_TO` y `CONTACT_EMAIL_FROM`; sin las tres no envía.
