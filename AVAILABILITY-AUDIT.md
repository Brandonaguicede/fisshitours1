# Auditoría de disponibilidad — 2026-09-16

Proyecto remoto: `aosrdxjuujlrpatwqiew`. Sitio: https://www.papagayofishingtourcr.com/reservar.

## Evidencia previa al cambio

1. El paquete que coincide con los cinco horarios descritos es `package-6391d855`, Full Day, 480 minutos. Es una identificación por coincidencia de configuración, no una confirmación de la sesión original del usuario.
2. Sus `departure_times` son `07:00`, `11:30`, `12:00`, `15:30`, `18:30`.
3. Las 15:30 corresponden a `afternoon`.
4. Las 18:30 corresponden a `evening`.
5. Ese paquete pertenece a Second Wind (`segundo-viento`), tour `tour-e55e4d8f`.
6. La consulta remota no encontró reservas a las 15:30 ni a las 18:30. No se identificó la reserva original que el usuario esperaba que bloqueara.
7. No puede atribuirse un estado o vencimiento a esa reserva sin identificarla.
8. La función publicada `get-booking-availability` versión 46 estaba desactualizada. Su código descargado solo consultaba `availability_blocks` por bote, fecha y slot. No consultaba `bookings`, duración ni paquete.
9. La migración de traslapes no estaba aplicada. Dos archivos locales usaban `202609160001`; la fila remota de ese número correspondía a `fix_tour_locations_rls`.
10. No existía el trigger `bookings_prevent_overlapping_boat_booking` en `pg_trigger`.
11. Las 18:30 aparecían porque estaban permitidas comercialmente y el endpoint publicado solo bloqueaba el mismo slot. Un bloqueo `afternoon` no bloqueaba `evening`.
12. Fallo de traslapes confirmado. La restricción operativa de salidas tardías no está definida en la configuración revisada.
13. No se encontró una hora de cierre configurada ni una validación de cierre en código/esquema.

La reproducción en el frontend publicado envió correctamente el proyecto, `boatId`, `tourId` y `tourPackageId`. En el flujo predeterminado Fishing / Full Day envió `segundo-viento`, `fishing`, `second-wind-fishing-full`, también de 480 minutos. No se observó frontend antiguo ni IDs incorrectos en esa reproducción.

**Causas confirmadas: A y B.** C y E no se reprodujeron. D no explica ninguna reserva concreta encontrada. La fórmula local de F pasó las pruebas del caso descrito; esto no constituye una certificación de todos sus casos posibles.

## Cambio mínimo

- Renombrada la migración `202609160001_prevent_overlapping_boat_bookings.sql` a `202609160002_prevent_overlapping_boat_bookings.sql`, sin cambiar su contenido SQL.
- Aplicada únicamente esa migración a producción, previa comprobación con `db push --dry-run`.
- Publicada `get-booking-availability` con el código local existente y su módulo `_shared/boat-availability.mjs`. No se reescribió la función.
- Actualizados `tests/booking-overlap/database.mjs` y `tests/booking-overlap/availability.mjs` con el caso de las 15:30 y 18:30, duración 480.
- No se modificaron frontend, `departure_times`, duración, cierre ni estados de reservas reales.

## Pruebas y resultado

Los dos tests locales pasan: límites adyacentes, otros botes/fechas, cancelaciones, horarios comerciales, inserciones directas y traslape exacto de la tarde.

Se ejecutó `public.create_booking_transaction` en producción dos veces dentro de una transacción con `ROLLBACK`, usando el paquete `package-6391d855`, bote `segundo-viento`, fecha de prueba `2035-10-20`, slots `afternoon` y `evening`, pago `pay-on-day`.

| Comprobación | Antes | Después |
|---|---|---|
| Segundo Full Day a las 18:30 después del de las 15:30 | Aceptado por el backend | Rechazado con `BOAT_TIME_CONFLICT` |
| Migración de traslapes | Ausente | `202609160002` aplicada |
| Trigger de traslapes | Ausente | Existe, `tgenabled = O` |
| Disponibilidad publicada | Bloqueo por slot exacto | Cálculo de intervalos con duración y horarios del paquete |

Las pruebas SQL no conservaron reservas ni clientes y no invocaron envío de correos. La comprobación del rechazo remoto fue a nivel del RPC usado para crear reservas; no se realizó un checkout pagado.

El navegador publicado recibió HTTP 200 para Fishing / Full Day después del despliegue, con los horarios del paquete y los IDs correctos. Sin reservas en esa fecha, mantuvo las salidas tardías autorizadas. La selección inicial de Beach & Snorkeling recibió 404 (`Tour is not available for this boat`); es una inconsistencia de catálogo observada fuera del caso Fishing y no se modificó.

## Límites y decisiones comerciales

No se inventó ninguna regla comercial. Sin una reserva que se traslape, las 18:30 siguen permitidas si figuran en `departure_times`; imponer un cierre requiere que el negocio defina esa regla o ajuste sus salidas permitidas.

Se conservó el alcance existente por `tour_date`: un intervalo que termina al día siguiente se compara correctamente contra otra salida de la misma fecha, como el caso solicitado. No se amplió la búsqueda a reservas cuya fecha de inicio sea otro día.

La consulta existente excluye `expires_at` vencidos; no se cambió esa política sin evidencia de que fuera la causa. También se observaron otros paquetes llamados Full Day con duración 240 o nula; no se alteraron por su nombre.

Scripts de evidencia reproducible: `tmp/availability-audit-state.sql`, `tmp/availability-backend-probe.sql` y `tmp/audit-live-availability.mjs`. Copia del endpoint anterior en `tmp/availability-audit-remote/`.
