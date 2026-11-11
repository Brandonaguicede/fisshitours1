# Comprobación BAC, CSP y Turnstile — 2026-11-10

## Turnstile remoto

La huella SHA-256 del secreto `DISABLE_TURNSTILE` coincide con el valor literal `true`. No existen `TURNSTILE_SECRET_KEY` ni `CLOUDFLARE_TURNSTILE_SECRET_KEY` entre los secretos del proyecto. Vercel tampoco lista `VITE_TURNSTILE_SITE_KEY`.

No se cambió el indicador: desactivarlo sin configurar el widget y su clave secreta bloquearía la creación de reservas. Requiere configurar las claves de Cloudflare para los dominios correspondientes, desplegar el frontend y verificar un token antes de exigirlo en el servidor.

## Inicialización real de BAC

Se abrió `/reservar` del despliegue de producción en Chromium, con CSP real y scripts reales de `secure.nmi.com`. Solo el catálogo y las respuestas de reservas se interceptaron con datos ficticios. El endpoint de cobro se bloqueó explícitamente. No se introdujeron números de tarjeta, no se tokenizaron tarjetas, no se crearon reservas reales ni se intentaron cargos.

Collect.js, Gateway.js, `/token/api/create` y los tres iframes respondieron HTTP 200. Se observaron bloqueos de `https://secure.nmi.com/token/styles.css` y del SDK Apple Pay cargado por Collect.js. Al permitir el SDK también se identificaron sus fuentes.

Se añadió `https://secure.nmi.com` a `style-src` y `https://applepay.cdn-apple.com` a `script-src` y `font-src`. La repetición de la comprobación con la cabecera corregida, sustituida localmente sobre la respuesta de producción, montó tres iframes sin eventos de violación CSP. No se añadieron `unsafe-eval` ni permisos globales de scripts.

Esto valida la inicialización del formulario, no la tokenización, el desafío 3DS ni el cobro. Esos pasos siguen pendientes de las pruebas autorizadas con tarjetas reales.

## Pruebas de USD 1

El checkout actual cobra `total_snapshot` de la reserva. No existe un paquete ni un flujo administrativo de certificación de USD 1. No modificar precios públicos ni sobrescribir el importe solo en el navegador. La opción propuesta es un flujo exclusivo de administradores con importe total fijo en servidor de USD 1.00, registro separado de evidencia y sin reservas, notificaciones de tour ni bloqueo de horarios. Su implementación queda pendiente de definir el alcance con el usuario.
