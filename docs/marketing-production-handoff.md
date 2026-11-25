# Entrega a marketing — Papagayo Fishing Tour

Actualizado: 12 noviembre 2026. Rama `preview/gtm-ga4-measurement`.
No desplegado. Publicidad desactivada por defecto. Ninguna cuenta externa se
considera verificada. El informe final y la revisión de dependencias contienen
bloqueos adicionales; no interpretar este documento como autorización de lanzamiento.

## Qué entrega desarrollo

GTM `GTM-T5RBJH88` con carga diferida y reintento limitado; Consent Mode v2 con
cuatro estados denied iniciales; consentimiento separado por categoría; eventos
tipados y saneados; seguimiento SPA; IDs estables para reservas y pagos; CSP sin
unsafe-inline/eval para scripts. Política técnica bilingüe en `/privacidad`.

La medición real requiere **ambas** banderas frontend true:
`VITE_MARKETING_ENABLED` y `VITE_GTM_CONTAINER_REVIEWED`, build de producción y
dominio exacto papagayofishingtourcr.com o www.papagayofishingtourcr.com. Mantenerlas
false hasta revisión y aprobación. La segunda bandera es una decisión operativa,
no evidencia automática de que las etiquetas sean seguras.

## Eventos y etiquetas

| Evento dataLayer | Condición / información específica | GA4 | Ads / Meta |
| --- | --- | --- | --- |
| page_view_spa | Primera ruta consentida o cambio real de pathname | page_view manual | Meta PageView opcional, con marketing y URL segura |
| view_item_list | Lista real visible; IDs, nombres, categorías, precios e índices | view_item_list | No conversión |
| view_item | Tour, barco o paquete realmente abierto/seleccionado | view_item | Meta ViewContent opcional |
| begin_checkout | Paquete seleccionado y precio calculado válido | begin_checkout | Meta InitiateCheckout opcional |
| add_payment_info | Continuar explícitamente tras validar formulario y método | add_payment_info | No Purchase |
| purchase | Recibo verificado con pago, transacción, moneda e importe positivos | purchase | Compra Ads; Meta Purchase |
| whatsapp_click | Clic real en enlace del número 50686105784 | whatsapp_click | Acción Ads independiente; Meta Contact |
| whatsapp_open_attempt | Intento programático tras acción de reserva | Evento diagnóstico opcional | NO crear conversión automática |
| reservation_submit_success | Backend aceptó reserva; booking_id opaco | reservation_submit_success | Lead separado de compra |
| contact_submit_success | Backend aceptó consulta | contact_submit_success | Consulta separada; no reserva confirmada |
| booking_confirmed | Recibo público con confirmed | booking_confirmed | NO duplicar Purchase |

Todos contienen event_id, page_path, page_location sin query/hash, page_referrer
reducido a origen externo HTTPS, analytics_consent, marketing_consent,
measurement_environment y meta_url_safe. Los campos comerciales ausentes se
restablecen a null para evitar herencia del evento anterior. No copiar todo el
dataLayer al proveedor. No usar la URL nativa como sustituto de los campos saneados.

Pago incluye transaction_id opaco, currency y value realmente capturado. No usar el
total reservado como alternativa. El mismo cobro conserva su ID; un ID opaco sigue
siendo un identificador y no prueba anonimización ni recepción del proveedor.

## Variables que debe crear el especialista

Variables Data Layer versión 2: event_id, page_path, page_title, page_location, page_referrer,
analytics_consent, marketing_consent, measurement_environment, meta_url_safe,
booking_id, transaction_id, ecommerce, ecommerce.transaction_id, ecommerce.currency,
ecommerce.value, ecommerce.tax, ecommerce.payment_type, ecommerce.item_list_name, ecommerce.items,
campaign_source, campaign_medium, campaign_name, campaign_content, campaign_term.
La plantilla de consentimiento lee directamente el estado vigente del navegador;
no confiar en un valor antiguo de consentimiento de un evento encolado.

GA4 confirmado por marketing: measurement ID `G-KQDFR0ZVPW`, propiedad `564077291`.
Todavía faltan el **AW-ID real** y **labels reales** de
WhatsApp, reserva, contacto y compra. Obtenerlos de las cuentas correctas; no
publicar etiquetas con valores ficticios. Pixel indicado por el negocio:
`1126431163430619`; confirmado por marketing en Meta Events Manager. El ID
`1020807004377131` corresponde a una app de Facebook, no a un Pixel web.

## Consentimiento antes de etiquetas

Crear una plantilla de etiqueta sandboxed usando `gtm-consent-template.js` como
fuente, con los permisos indicados en ese archivo. No pegarla como Custom HTML.
Disparar en Consent Initialization y en evento exacto `consent_updated`. Utiliza
setDefaultConsentState/updateConsentState y confirma la revisión vigente mediante
pftConsentApplied. Sin esta confirmación no se liberan eventos productivos propios.
El acknowledgement acredita orden del consentimiento, no recepción de conversiones.

Todos los triggers de medición requieren:

- measurement_environment = production y ruta pública permitida.
- GA4: analytics_consent = true y consentimiento adicional analytics_storage.
- Ads: marketing_consent = true y ad_storage/ad_user_data; personalización requiere
  además ad_personalization.
- Meta: marketing_consent = true, controles publicitarios de consentimiento,
  meta_url_safe = true y revocación respetada por su plantilla.
- Excluir siempre /admin y /update-password, aunque GTM ya esté cargado.

Consent Mode no impide por sí solo un Custom HTML malicioso o mal configurado.
Revisar/exportar todas las etiquetas, eliminar automatismos incompatibles y limitar
permisos de edición. No activar una etiqueta genérica All Pages de publicidad.

## Configuración de etiquetas

Google tag: desactivar send_page_view automático y medición mejorada de History,
formularios/clics que dupliquen eventos propios. Cada evento usa trigger Custom
Event exacto. Configurar campos saneados y campaña explícita según admite la
etiqueta; no asumir atribución por encontrar campañas en dataLayer. No enviar
page_title ni otros campos automáticos si pueden contener referencias privadas.

Conversion Linker: ejecutar después del permiso publicitario en consent_updated;
comprobar recarga con permiso guardado. URL passthrough desactivado. El linker puede
leer click IDs de la URL actual después del permiso: verificar antes de abandonar
la landing. Desarrollo no elimina ni cambia parámetros del checkout para ayudarlo.

Meta: una inicialización, sin PageView adicional automático, sin detección automática
de eventos/formularios ni advanced matching automático. Usar eventID = event_id;
Purchase usa value/currency verificados. No inicializar otro Pixel desde hosting.
Usar una plantilla revisada compatible con CSP, no Custom JavaScript que requiera
unsafe-eval. Enhanced Conversions está apagado; si se aprueba, variable sandboxed
que invoque únicamente pftEnhancedConversionEmail y la variable oficial User-provided
Data de Google. No usar detección automática ni enviar email a GA4/Meta/dataLayer.

## Atribución y privacidad

Solo después del permiso se conservan campañas y click IDs permitidos; contexto
de sesión de 30 minutos. UTMs requieren slugs limitados; se rechazan email, tokens,
valores extensos, cadenas numéricas largas y parámetros duplicados. GCLID/DCLID,
GBRAID/WBRAID/FBCLID se conservan únicamente con permiso publicitario en contexto
dedicado, no en el dataLayer general. No se envían por servidor actualmente.

Meta puede recoger la URL nativa: solo se permiten query keys conocidas y válidas,
sin hash. Un parámetro desconocido, sensible o inválido bloquea Meta. No quitar
este filtro por una caída de atribución. Campañas con formatos rechazados o perdidas
antes de aceptar no se recuperan retrospectivamente. El referrer se limita a origen,
por lo que se pierde su detalle. Verificar Network real antes de activar.

## Entrega y duplicaciones

Generado ≠ encolado a dataLayer ≠ procesado por etiqueta ≠ aceptado por proveedor.
La cola en memoria caduca a los 30 minutos y se limita a 200 entradas. No hay marcas
permanentes de entrega. Reintenta carga del contenedor tras error definitivo hasta
tres intentos; online/navegación/consentimiento pueden solicitar otro intento tras
la espera. Un timeout ambiguo no provoca reinyección. No reintentar ciegamente
compras porque falte una respuesta del navegador. El proveedor debe validar su
deduplicación real por transacción/evento; no se garantiza entrega desde cliente.

No reproducir un evento para una categoría que no estaba permitida al generarse.
Revocar suprime los permisos pendientes. La deduplicación no cruza dispositivos.
No registrar compra Ads como principal y además importar la misma compra GA4 como
otra principal. El conteo Una/Todas se decide por acción comercial, no por código.

Captura administrativa, confirmación manual y webhook exclusivo no están medidos
por servidor: ver `marketing-server-events-design.md`, PENDIENTE DE APROBACIÓN.
Antes de añadir servidor, elegir propietario de Purchase por destino; Meta híbrido
requiere validar sus reglas CAPI/Pixel y usar el mismo event_name/event_id.

## Validación externa obligatoria

Tag Assistant: defaults antes de tags; cuatro permisos; aceptación/rechazo,
categorías independientes, revocación, dos pestañas, recarga y rutas con barra final;
un page_view por navegación, cero compras por autorización BAC, fallo o cancelación;
comprobar que ninguna etiqueta antigua transmite antes del permiso o desde admin.
Revisar CSP Page issues; no ampliar permisos con unsafe-inline/eval. img-src y
frame-src conservan permisos HTTPS previos para catálogo externo y retos de pago:
no se han restringido a ciegas porque eso podría romper 3DS. Cualquier nuevo destino
debe justificarse por proveedor y directiva; no habilitar comodines generales nuevos.

GA4 DebugView/Ads: verificar flujo, nombres, transaction_id, moneda, importe,
campañas y diagnósticos. Aceptación HTTP no asegura atribución en los informes.
Meta Events Manager: Pixel correcto, Test Events aislados, permisos, URL y datos,
eventID, valor/moneda y deduplicación. No usar compras reales como prueba de humo.
El GTM del harness es simulado: sus pruebas no acreditan estas verificaciones.

## Antes de activar publicidad

- [ ] Resolver/triage de dependencias críticas/altas documentadas en el informe.
- [ ] Aprobar alcance pendiente de servidor y tratamiento de reembolsos.
- [ ] Revisar legalmente política, retención externa y transferencias.
- [ ] Obtener GA4/AW/labels reales; auditar versión publicada del contenedor.
- [ ] Crear y probar plantilla, triggers, etiquetas y consentimiento adicionales.
- [ ] Verificar HTML/cabeceras/Network realmente servidos en todas las rutas.
- [ ] Verificar campañas, exclusión de PII y ausencia de duplicados en plataformas.
- [ ] Aprobar despliegue y habilitación por separado; no desplegado por esta tarea.

Referencias: [CSP Google](https://developers.google.com/tag-platform/security/guides/csp),
[Consent templates](https://developers.google.com/tag-platform/tag-manager/templates/consent-apis).
