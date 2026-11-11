# Resultado de pruebas BAC — 2026-10-29

## Resultado principal

La clave pública Token configurada no es reconocida por `sandbox.nmi.com`: Collect.js recibe HTTP 404, `E_RESOURCE_NOT_FOUND`, `User not found` al solicitar `/token/api/create`.

La misma clave sí es reconocida por `secure.nmi.com`: la creación de campos responde HTTP 200, se montan los tres iframes de tarjeta y el formulario queda listo. La respuesta del servicio indica **`testMode: false`**. Esta comprobación valida la creación de campos, no una autenticación 3DS ni un cobro.

El dominio secure se probó únicamente mediante una sustitución temporal en el navegador de diagnóstico. No se cambiaron los archivos locales ni el secreto remoto de gateway a secure. No se introdujeron números de tarjeta, no se solicitaron tokens de tarjetas y no se llamó a la función de cobro. Las reservas de esta prueba fueron interceptadas por el navegador y nunca se guardaron en Supabase.

Por la condición de habilitar BAC únicamente para pruebas correctamente configuradas, se dejó `payment_methods.key = 'bac-card'` con `active = false`. El gateway local y remoto continúa apuntando a sandbox. Que ese valor estuviera guardado previamente en Supabase no demuestra que las credenciales correspondan a ese entorno; la prueba real encontró la incompatibilidad.

## Comprobaciones automatizadas

- TypeScript y build de producción: aprobados.
- 25 pruebas de BAC con PostgreSQL en memoria y proveedores simulados: aprobadas. Cubren sale, auth/capture, void/refund, permisos, USD, montos del servidor, intentos concurrentes, límites y conciliación.
- 9 pruebas CORS: aprobadas.
- Suite de reservas en navegador con claves ficticias: 24 aprobadas; se omite intencionalmente el caso de claves ausentes porque esta ejecución sí proporciona claves ficticias.
- Prueba adicional del timeout de carga de campos: aprobada. Se volvió a comprobar también el escenario de 3DS duplicado y resultado incierto tras este cambio.
- Escritorio y móvil: selección BAC, total USD, ausencia de desbordamiento horizontal y bloqueo de otro método mientras se procesa.

No confundir las operaciones simuladas aprobadas con transacciones certificadas por BAC. Tampoco se validó todavía la clave CHECKOUT contra una autenticación 3DS real ni la clave privada mediante una transacción.

## Corrección aplicada

El formulario deja de esperar indefinidamente si el gateway no crea los campos: a los 20 segundos muestra un error recuperable y permite elegir otro método. El timeout se limpia al cargar los campos o desmontar el componente. Este cambio está en el código local de development.

## Pendiente para certificación

BAC debe confirmar y habilitar el modo de pruebas de la cuenta reconocida en secure.nmi.com, o entregar las credenciales correspondientes a sandbox.nmi.com. Después se alinean ambos gateways y se vuelve a activar el método.

Texto para consultar a BAC:

> Al inicializar Collect.js, sandbox.nmi.com responde `E_RESOURCE_NOT_FOUND: User not found`. En secure.nmi.com la misma clave Token carga los campos y la respuesta indica `testMode: false`. No hemos enviado cobros. ¿Pueden habilitar Test Mode para realizar la certificación, o facilitarnos credenciales sandbox? Necesitamos también las tarjetas y los casos de prueba aprobados para Visa, Mastercard y American Express.

Siguen pendientes ventas aprobadas y rechazadas con las tres marcas, el desafío 3DS y las demás operaciones solicitadas por BAC. No se notificó al banco ni se realizó ningún cargo real.
