# Papagayo Fishing Tour — auditoría viva de medición de producción

Última actualización: 2026-11-17 (Costa Rica)
Rama de liberación: `fix/measurement-frontend-release`
Estado: trabajo local; sin despliegue, publicación de GTM ni migraciones de producción.

## Alcance y responsables

- Desarrollo: código del sitio, consentimiento, `dataLayer`, evidencia de pagos externos y entrega de servidor.
- Marketing: contenedor `GTM-T5RBJH88`, GA4, Google Ads, Meta Events Manager y publicación del contenedor.
- Identificadores confirmados:
  - GA4: `G-KQDFR0ZVPW`.
  - Meta Dataset/Pixel: `1126431163430619`.
  - WhatsApp: `+506 8610 5784`.

## Estado ejecutivo

| Área | Estado | Evidencia |
| --- | --- | --- |
| GTM y CSP | Implementado, pendiente de validación externa final | Bootstrap mismo origen, CSP restrictiva y pruebas de consentimiento |
| Consent Mode v2 | Implementado y probado localmente | Cuatro señales denegadas por defecto; carga posterior al permiso |
| Eventos web GA4 | Implementados y probados localmente | Contrato de seis eventos, limpieza de `ecommerce` y pruebas SPA |
| Meta web vía GTM | Configurado por marketing; validación externa pendiente | El sitio no instala un segundo Pixel |
| Atribución de reserva | Implementada localmente | IDs limitados por consentimiento y tabla privada preparada |
| Pago BAC externo por WhatsApp | Evidencia y outbox implementados localmente | Transacción SQL atómica e idempotente, migración no aplicada |
| Meta CAPI | Adaptador y worker local probados con mocks; acceso/token pendientes | No verificado externamente |
| GA4 Measurement Protocol | Adaptador y worker local probados con mocks; API secret pendiente | No verificado externamente |
| Google Ads offline | Contrato Data Manager API probado; transporte bloqueado por cuenta/acción/autenticación | No verificado externamente |

## Decisiones de seguridad y privacidad

1. GTM no carga antes del consentimiento correspondiente.
2. Los identificadores publicitarios se guardan únicamente con consentimiento de marketing.
3. Los identificadores GA se guardan únicamente con consentimiento de analítica.
4. No se almacenan PAN, CVV, tokens de tarjeta, IP, user-agent ni URL arbitraria en las tablas de medición.
5. La evidencia BAC externa es administrativa e inmutable; no autoriza ni captura dinero.
6. Un pago externo debe coincidir exactamente con el total y la moneda guardados en la reserva.
7. La confirmación, evidencia y creación del evento canónico ocurren en una transacción.
8. Los secretos de GA4/Meta serán variables exclusivas del backend, nunca `VITE_*`.
9. La medición nunca puede invalidar una reserva o un pago ya aceptado.

## Identidad e idempotencia

El identificador de medición se deriva de forma determinista:

`SHA-256("pft-measurement-v1:booking:" + booking UUID)`

El mismo valor debe utilizarse como:

- GA4 `transaction_id`.
- Meta `event_id`.
- Identificador de deduplicación entre navegador y servidor.

La referencia BAC se conserva por separado para conciliación y nunca sustituye el identificador de medición.

### Hallazgo corregido durante esta fase

El primer borrador del outbox utilizaba el UUID interno crudo mientras el checkout utilizaba el hash opaco. Esto habría impedido deduplicar una eventual entrega navegador/servidor. La migración preparada fue corregida para usar exactamente la misma derivación SHA-256 y se añadió una prueba de igualdad.

## Evidencia de pruebas acumulada

| Validación | Resultado |
| --- | --- |
| TypeScript | Aprobado |
| Build Vite de producción | Aprobado; advertencia no bloqueante por chunks grandes |
| Backend/seguridad/medición | 73/73 aprobadas |
| Checkout general | 25/25 aprobadas; 2 BAC omitidas en ejecución sin claves ficticias |
| Checkout BAC simulado | 2/2 aprobadas |
| SQL real simulado de evidencia/outbox/leases | 4/4 aprobadas |
| Adaptadores GA4 MP y Meta CAPI | 5/5 aprobadas con transporte simulado |
| Worker, autenticación, consentimiento y reintentos | 4/4 aprobadas con cola y proveedores simulados |
| Activación `disabled` / `validate` / `live` | Probada localmente; `live` exige doble aprobación |
| GA4 Debug externo | Payload sintético aceptado con `validationMessages: []`; credenciales y recepción real no verificadas |
| Google Ads Data Manager | Constructor de evento probado; sin transporte ni credenciales |
| E2E administrativo selectivo | Aprobado: evidencia, doble clic, calendario y recuperación |
| `git diff --check` | Aprobado |

### Revalidación integral — 15 noviembre 2026

- `npm run typecheck`: aprobado.
- `npm run build`: aprobado con Vite 5.4.21; solo permanece la advertencia no bloqueante del chunk dinámico de ExcelJS.
- Suite focalizada de seguridad, reservas, BAC/NMI, PayPal, medición y conversiones de servidor: **92/92 aprobadas**.
- Regresión completa del checkout: **25/25 aprobadas** y dos casos BAC omitidos intencionalmente al ejecutar sin claves ficticias.
- Regresión BAC/NMI aislada con configuración ficticia: **2/2 aprobadas**; no se procesaron cobros.
- Artefacto productivo de medición en Chromium y WebKit móvil: **8/8 aprobadas**, cubriendo CSP, consentimiento, carga única de GTM, navegación SPA, recuperación de red y revocación.
- `npm audit --json`: **7 paquetes reportados** (2 altos, 5 moderados, 0 críticos).
- `npm audit --omit=dev --json`: **5 paquetes reportados** (1 alto, 4 moderados, 0 críticos).
- DOMPurify permanece corregido en 3.4.17. Los avisos restantes requieren migraciones mayores de Zod, Router o Vite, o pertenecen al camino ExcelJS → UUID que no alcanza la API vulnerable según la fuente inspeccionada. No se forzaron cambios incompatibles.

La primera ejecución del runner de checkout dentro del sandbox no pudo conectarse al servidor loopback y terminó por timeout. La repetición fuera de ese aislamiento, sobre `127.0.0.1` y con fixtures locales, completó todas las pruebas indicadas. No se interpretó el timeout como aprobación ni como defecto funcional del checkout.

### Verificación web del preview — 15 noviembre 2026

Preview comprobado: `https://fisshitours1-o1f7kfe62-papagayo-fishingtour.vercel.app`.

- HTTP 200 y `X-Robots-Tag: noindex`.
- La CSP desplegada conserva NMI, PayPal y Apple Pay y permite únicamente los endpoints previstos de Google y Meta.
- `measurement-bootstrap.js` carga desde el mismo origen y contiene `GTM-T5RBJH88`.
- Antes de consentimiento: los cuatro estados de Consent Mode v2 están en `denied`, no existe `fbq`, no existe script `gtm.js` y no hubo solicitudes a Google o Meta.
- Consentimiento solo analítica: exactamente un script y una solicitud a `gtm.js`; Meta continúa ausente.
- Cambio SPA posterior: el loader continúa único (`gtm.js` y script = 1), sin errores de página.
- Consentimiento completo: la preferencia llega al `dataLayer`, pero `fbq` continúa ausente y no aparecen eventos `page_view_spa`.
- El JavaScript público servido por GTM no contiene `G-KQDFR0ZVPW`, `1126431163430619` ni los nombres de las etiquetas personalizadas esperadas.

Conclusión: el código desplegado del preview funciona en modo fail-closed, pero la versión pública del contenedor todavía no contiene el workspace preparado por marketing. Para observar las 15 etiquetas sin publicarlas se requiere conectar el preview mediante Tag Assistant con una sesión autenticada. Esta prueba web no demuestra recepción en GA4 ni Meta.

### Hallazgo de Tag Assistant: `begin_checkout` duplicado

Una sesión limpia de Vista previa mostró dos eventos `begin_checkout` y dos `InitiateCheckout` para una sola entrada al flujo, incluso sin aceptar términos. La causa estaba en `BookingPanel`: la medición se ejecutaba primero con el cálculo local y nuevamente cuando la ubicación de salida predeterminada producía el precio definitivo del backend; el valor formaba parte de la clave de deduplicación.

La corrección local espera una cotización backend estable que incluya la ubicación de salida y utiliza el ID del paquete como clave estable durante ese checkout. No cambia términos, reservas, precios ni operaciones financieras. Requiere nuevo preview y repetición en Tag Assistant antes de clasificarla como corregida externamente.

Se generó el preview `fisshitours1-hekgysnln-papagayo-fishingtour.vercel.app` con las tres banderas de medición limitadas a ese build. Una comprobación remota confirmó cero solicitudes GTM antes del consentimiento y exactamente un script/una solicitud `gtm.js` después de aceptar. El preview intermedio `fisshitours1-owy4rr1go-papagayo-fishingtour.vercel.app` no incluía esas banderas y no sirve para Tag Assistant; no se interpretó su timeout como fallo del loader.

Tag Assistant confirmó posteriormente, en una sesión limpia del preview corregido, exactamente una activación de `GA4 - begin_checkout` y una de `Meta Pixel - InitiateCheckout`. El hallazgo queda **CORREGIDO Y PROBADO EN PREVIEW**. También se observaron dos `page_view_spa`, correspondientes a las dos rutas reales visitadas, y ningún evento de pago o compra.

Una prueba posterior confirmó el contrato de `add_payment_info` para BAC/NMI: `payment_type = BAC/NMI`, `currency = USD`, item `second-wind-water-toys-half`, subtotal 850, IVA 110.50 y total 960.50. Las etiquetas GA4 y Meta se activaron; no apareció `purchase`. El resumen de Tag Assistant contenía dos intentos acumulados y no acredita unicidad en una sola carga.

También se confirmó el camino prioritario de WhatsApp con `payment_type = WhatsApp payment link`, el mismo paquete, subtotal, IVA y total, y un `event_id` separado por canal. Esto valida `add_payment_info` al entregar la reserva hacia WhatsApp; no valida pago ni compra. `booking_id = null` y `transaction_id = null` son correctos en esta etapa previa a la respuesta del backend. La compra del enlace BAC externo solo puede originarse después, desde la confirmación administrativa verificada y el outbox de servidor. Migraciones, worker, secretos y recepción real de proveedores permanecen pendientes.

En la prueba apareció `whatsapp_open_attempt` después de `add_payment_info`, pero no `reservation_submit_success`. El código solo abre WhatsApp después de que `create-booking` devuelve una reserva, por lo que se creó al menos un registro de prueba. La ausencia del evento de éxito implica que el backend actualmente desplegado no devolvió un `measurement` verificable con `production = true` (o no contiene todavía ese contrato); el frontend lo suprimió en modo fail-closed. **PENDIENTE:** localizar y cancelar los registros de prueba por referencia, desplegar de forma coordinada la función/migración aprobada y repetir una única reserva controlada. No realizar más intentos en este preview hasta limpiar los registros.

El payload del preview presenta `measurement_environment = production`. Esto coincide con el contrato actual del contenedor, cuyos triggers exigen ese valor incluso durante la validación del preview, pero puede contaminar propiedades reales con eventos de prueba. No se cambió unilateralmente a `preview` porque las etiquetas dejarían de disparar. Pendiente de coordinación con marketing: aceptar explícitamente `preview` en el workspace de depuración y excluir esos eventos de conversiones/informes, o definir un mecanismo oficial de tráfico interno/test para GA4 y Meta.

No se ejecutaron cobros, llamadas reales a plataformas publicitarias ni escrituras en producción.

## Migraciones preparadas y no aplicadas

- `202611150001_measurement_attribution.sql`
- `202611150002_external_payment_measurement_outbox.sql`
- `202611150003_measurement_delivery_leases.sql`
- `202611150004_measurement_delivery_monitoring.sql`

Requieren revisión, respaldo y ventana de migración antes de aplicarse.

### Preflight remoto — 15 noviembre 2026

La consulta read-only al proyecto Supabase vinculado confirmó que las cuatro migraciones de medición no están aplicadas y que `process-measurement-outbox` no está desplegada. Un `db push --dry-run` intentaría aplicar antes `202611120001_security_audit_invariant_guards.sql`, que modifica una función de fallos PayPal y controles de columnas financieras. Esa migración queda fuera de la autorización de medición y bloquea un `db push` automático de este lote. No se aplicó ninguna migración ni se desplegó ninguna función.

La lista de nombres de secretos tampoco contiene todavía la configuración requerida por el worker de medición (autenticación del worker, doble aprobación live, GA4 Measurement Protocol, Meta CAPI y Google Ads Data Manager). Por tanto, incluso con tablas creadas, la entrega debe permanecer desactivada hasta provisionar secretos mediante un canal seguro y validar primero `disabled`/`validate`.

### Despliegue escalonado autorizado — 15 noviembre 2026

Se aplicaron exclusivamente las migraciones `202611150001` a `202611150004` mediante un paquete aislado cuyo dry-run enumeró solo esas cuatro. `202611120001_security_audit_invariant_guards.sql` quedó sin aplicar porque modifica lógica PayPal/financiera. El historial remoto confirma las cuatro migraciones de medición aplicadas.

Se desplegaron `create-booking` y `process-measurement-outbox`. No se desplegó `admin-confirm-booking`: el panel productivo actual no envía todavía evidencia BAC y desplegar la función nueva lo volvería incompatible para reservas WhatsApp. El worker no tiene sus secretos de activación; una llamada POST sin secreto respondió 401 y no procesó la cola. No se enviaron conversiones ni se modificaron operaciones BAC/NMI o PayPal.

Rollback preparado en `scripts/rollback-measurement-release.sql`; no ejecutado. Antes de usarlo deben exportarse las filas que pudieran existir en las tablas de medición.

### Validación de creación en Preview — 16 noviembre 2026

El primer intento fue rechazado antes de cualquier operación financiera con HTTP 400. La respuesta reproducible de `create-booking` identificó `customer.whatsapp` con menos de 7 caracteres. Se alineó la validación del formulario con el contrato del backend (7–32 caracteres), se limita el campo a 32 y se recortan nombre, correo y teléfono antes del envío.

Una repetición controlada creó correctamente la reserva de prueba `PFT-6341BCE0` en estado `pending_payment`, por USD 881.40. El recibo indicó `booking_confirmed=false`, `payment_confirmed=false` y `production=false`; por tanto no se generó `purchase`. PayPal se detuvo después de crear la reserva porque Preview no tiene `VITE_PAYPAL_CLIENT_ID` sandbox. La reserva debe cancelarse/limpiarse al cerrar la validación.

Por instrucción explícita posterior, el `VITE_PAYPAL_CLIENT_ID` ya existente de producción se amplió en Vercel para incluir también `Preview`, sin leer ni descargar su valor y sin mover el Client Secret. Se generó el preview `https://fisshitours1-ovjf0rx7w-papagayo-fishingtour.vercel.app`. Este preview usa PayPal real, no sandbox: ninguna aprobación/captura debe ejecutarse sin autorización inmediata, y cualquier pago completado será una operación financiera real.

La prueba BAC real #1 (`PFT-10A00573`) confirmó en base de datos `booking_status=confirmed`, `payment_status=paid`, proveedor BAC, importe USD 5.65 y presencia de transacción del proveedor. No emitió `purchase`: `MARKETING_MEASUREMENT_ENABLED` y `BAC_LIVE_PAYMENTS_VERIFIED` todavía no existían, por lo que el recibo quedó cerrado como no productivo. La transacción no se reinterpretó retroactivamente.

Con autorización explícita se establecieron después ambas banderas en Supabase. No se cambiaron credenciales, autorización, captura, reembolso, montos ni el worker de conversiones. La siguiente compra BAC real es la primera elegible para validar el evento `purchase` del navegador.

Las compras BAC posteriores confirmaron IDs de medición únicos, pero la función remota todavía no incluía el recibo agregado localmente, por lo que el navegador no podía emitir `purchase`. Tras una segunda autorización específica se estableció `MOCK_EXTERNAL_PROVIDERS=false` y se desplegó `bac-process-payment` v9. El diff desplegado agrega únicamente `measurementReceipt` después de la liquidación existente y lo incorpora a la respuesta; no modifica tokenización, 3DS, importe, autorización, captura, reembolso ni transición financiera.

Estado acordado de la validación BAC: **flujo financiero aprobado** con evidencia real de cobro por USD 5.65, IVA correcto, reserva `confirmed`, pago `paid`, transacción del proveedor presente e IDs de medición únicos. **Purchase no se considera validado**: las primeras operaciones precedieron el despliegue del recibo analítico y la sesión posterior tenía `fbevents.js` bloqueado por un bloqueador de anuncios (`ERR_BLOCKED_BY_CLIENT`). La CSP sí autorizaba `connect.facebook.net`; no se debilitó. La recepción de Purchase en GA4/Meta queda pendiente de validación externa futura.

Con autorización específica se desplegó `paypal-capture-order` v78 antes de iniciar la prueba PayPal real. El diff agrega únicamente `measurementReceipt` después de una captura PayPal ya verificada y lo incorpora a la respuesta; no modifica creación de órdenes, importe, autorización, captura, webhook ni reembolsos.

La prueba PayPal real `PFT-9AB53079` quedó `confirmed/paid` por USD 5.65 y con transacción PayPal presente. El ID estable de medición fue distinto de los BAC. El flujo financiero PayPal queda aprobado; Purchase permanece sin evidencia en Tag Assistant y no se repitió el cobro. Meta Base/InitiateCheckout/AddPaymentInfo funcionaron después de retirar el bloqueador local de anuncios.

Los dos `begin_checkout` observados en una sesión no fueron duplicados: correspondieron a `package-44799d1b` (USD 847.50) y `package-1a182e3c` (USD 5.65), cada uno con su propio `event_id`. La deduplicación por paquete se comportó correctamente.

Validación local final del 16 noviembre 2026: typecheck aprobado; 42/42 pruebas enfocadas de reservas, consentimiento, bootstrap, medición, outbox y conversiones de servidor aprobadas; build Vite productivo aprobado; `git diff --check` sin errores (solo avisos CRLF). Las pruebas Playwright que requieren lanzar Edge permanecen no verificadas en este entorno por cierre del navegador durante `launch`.

Validación local de la corrección: typecheck aprobado, prueba específica de contrato WhatsApp aprobada, pruebas de backend y medición aprobadas y build de producción aprobado. La suite que abre Edge no pudo ejecutarse en este entorno: el navegador cerró durante `launch` incluso en modo secuencial; no se interpretó como aprobación ni como fallo funcional.

## Pendientes y bloqueos externos

1. Crear el API secret de GA4 Measurement Protocol y guardarlo como secreto de Supabase.
2. Obtener acceso y token de Meta CAPI para el dataset `1126431163430619`.
3. Confirmar versión de Graph API y política de rotación del token.
4. Activar Google Ads y entregar la acción de conversión offline.
5. Definir retención de atribución, evidencia y recibos de entrega.
6. Definir correcciones, reembolsos y cancelaciones para cada proveedor.
7. Validar recepción real en GA4 DebugView/Realtime, Meta Test Events y Google Ads.
8. Publicar GTM únicamente después de la aprobación conjunta.

### Hallazgo de compatibilidad Google Ads 2026

La documentación oficial vigente indica que las nuevas implementaciones de conversiones offline posteriores al 15 de junio de 2026 deben utilizar Data Manager API. Por ello no se implementó `UploadClickConversions` del Google Ads API. El contrato local usa `POST https://datamanager.googleapis.com/v1/events:ingest`, `transactionId`, `eventTimestamp`, `gclid`/`gbraid`/`wbraid`, consentimiento y un `Destination` con Customer ID y Conversion Action ID. El transporte permanece bloqueado hasta definir el modelo de autenticación y recibir IDs reales.

## Adaptadores de servidor preparados

`supabase/functions/_shared/server-conversions.ts` contiene constructores y transportes aislados:

- GA4 exige consentimiento de analítica, `client_id` válido, tiempo dentro de 72 horas y el `transaction_id` opaco.
- Meta exige consentimiento de marketing, datos mínimos de coincidencia, URL canónica permitida y `event_id` igual al `transaction_id`.
- Email y teléfono se normalizan y se convierten a SHA-256; `_fbp` y `_fbc` se validan pero no se hashean.
- Ningún token se incluye en la URL de Meta ni en logs/recibos.
- La versión de Graph API debe configurarse explícitamente; no existe un valor silencioso que pueda quedar obsoleto.
- El endpoint de depuración de GA4 está separado del endpoint de entrega. Un HTTP 2xx de GA4 no se documenta como prueba de aparición en informes.

El worker `process-measurement-outbox` está implementado localmente pero permanece desactivado por defecto:

- Exige `MEASUREMENT_WORKER_SECRET` de al menos 32 caracteres.
- No reclama filas si `SERVER_CONVERSIONS_ENABLED` no es exactamente `true`.
- Solo reclama destinos cuya configuración backend esté completa.
- Usa leases de 90 segundos y `FOR UPDATE SKIP LOCKED` para impedir procesamiento concurrente.
- Mantiene una fila por proveedor; un éxito de GA4 no oculta un fallo de Meta.
- Reintenta únicamente errores transitorios, con backoff exponencial y máximo de ocho intentos.
- Una revocación de consentimiento posterior al pago suprime el destino antes del envío.
- Google Ads permanece en espera y el worker no puede reclamarlo todavía.
- Los recibos se limitan a identificadores seguros del proveedor; no almacenan payloads, tokens ni PII.
- `validate` fuerza GA4 Debug y requiere `META_TEST_EVENT_CODE` para habilitar Meta.
- `live` requiere simultáneamente `SERVER_CONVERSIONS_MODE=live` y `SERVER_CONVERSIONS_LIVE_APPROVED=true`.

### Validación externa no recolectora de GA4

El 2026-11-15 se envió un evento `purchase` completamente sintético al endpoint oficial `https://www.google-analytics.com/debug/mp/collect`. La respuesta fue:

```json
{"validationMessages":[]}
```

Esto valida la estructura, no las credenciales ni la recepción en la propiedad. Google indica que Debug no valida `measurement_id`/`api_secret` y no incorpora esos eventos a informes. GA4 real permanece **NO VERIFICADO**.

Referencias oficiales revisadas el 2026-11-15:

- GA4 Measurement Protocol: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag
- Validación GA4: https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events?client_type=gtag
- Meta Marketing API / conversiones offline: https://developers.facebook.com/docs/marketing-api/offline-conversions/getting-started
- Google Data Manager `events.ingest`: https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest
- Destinos Data Manager: https://developers.google.com/data-manager/api/devguides/concepts/destinations

## Veredicto actual

**PENDIENTE DE CORRECCIONES Y VALIDACIÓN EXTERNA.**

El frontend y la captura de evidencia están preparados localmente, pero todavía no existe evidencia de recepción de conversiones de servidor por GA4, Meta o Google Ads. Producción no está aprobada.
