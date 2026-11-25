# Validación de seguimiento — 17 de noviembre de 2026

## Correcciones preparadas por desarrollo

- `view_item` se emite al existir una selección real del checkout y una cotización válida.
- El artículo usa el paquete/tour seleccionado, variante del bote y precio real cotizado.
- La clave `checkout:<boat_id>:<package_id>` evita duplicados por renderizados de React.
- La atribución de reserva incorpora `fbclid` con consentimiento de marketing.
- La atribución incorpora `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` y `utm_term` con consentimiento analítico.
- `gclid`, `gbraid`, `wbraid`, `_fbp`, `_fbc`, GA4 `client_id` y `session_id` se conservan.
- La Edge Function valida formato y consentimiento antes de persistir los campos.
- La migración afecta únicamente `measurement_attribution`; no modifica reservas, estados de pago ni operaciones BAC/NMI o PayPal.
- Se reemplazaron restricciones PostgreSQL incompatibles con `{10,256}` por validación de caracteres y `char_length`.

## Resultados de pruebas

- TypeScript: aprobado.
- Build productivo de Vite: aprobado.
- Artefacto/CSP: aprobado.
- Analítica, consentimiento y deduplicación: 16/16 aprobadas.
- Contrato y rollout de creación de reservas: 12/12 aprobadas.
- Migración de atribución con PostgreSQL embebido: 1/1 aprobada.
- Regresión BAC/NMI: 31/31 aprobadas.

## Pendiente de GTM y marketing

1. Desactivar el `page_view` automático del Google Tag o retirar el activador duplicado.
2. Activar Meta PageView con el evento `page_view_spa` para navegación SPA.
3. Mapear `event_id` mediante `DLV - event_id` en todas las etiquetas de Meta.
4. Validar que las etiquetas de `view_item`, `begin_checkout`, `add_payment_info` y `purchase` escuchen sus eventos personalizados.
5. Vincular GA4 con Google Ads `753-478-7817`.
6. Agregar Conversion Linker y configurar/importar `generate_lead` y `purchase` con los identificadores reales de Google Ads.
7. Confirmar recepción en Tag Assistant, GA4 DebugView y Meta Events Manager.

## Pendiente de autorización técnica

- Aplicar `202611170001_measurement_campaign_fields.sql`.
- Desplegar conjuntamente la versión actualizada de `create-booking`.
- Publicar el nuevo frontend después de aplicar backend y migración.

No se realizaron cobros ni cambios financieros durante esta corrección.

## Compra de servidor para enlaces BAC externos

- La confirmación administrativa de una reserva `whatsapp-link` exige la fecha/hora real del pago, el monto exacto almacenado en la reserva y una referencia BAC válida.
- La operación PostgreSQL confirma el pago y crea el evento de medición en una sola transacción idempotente. Repetir la confirmación no crea otra compra.
- `transaction_id` es el identificador opaco estable derivado de la reserva; Meta CAPI utiliza exactamente ese mismo valor como `event_id`.
- El recibo BAC se conserva por separado para conciliación y nunca sustituye al identificador de deduplicación.
- PayPal y BAC/NMI del checkout conservan sus flujos verificados existentes; el endpoint administrativo rechaza evidencia externa para esos medios.
- Sin consentimiento aplicable, el pago sí puede confirmarse, pero no se crea entrega para ese proveedor.
- La entrega real continúa desactivada hasta configurar secretos backend y validar primero GA4 Debug y Meta Test Events. No se afirmó recepción externa.

Validación local: 60/60 pruebas enfocadas aprobadas, typecheck aprobado y build productivo aprobado. Las pruebas administrativas que abren navegador permanecen no verificadas por un bloqueo del lanzador en Windows; no se interpretaron como aprobadas.
