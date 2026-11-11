# Certificación BAC de USD 1

Ruta: `/admin/bac-certification`. Disponible únicamente para perfiles `admin` activos; el servidor vuelve a autenticar cada petición. Los editores no ven el acceso ni pueden invocar las operaciones.

## Alcance

No crea reservas, no bloquea horarios, no envía correos de tour, no cambia precios ni modifica PayPal. La tabla `bac_certification_payments` conserva las pruebas por separado. No aparece en los ingresos de reservas.

Cada pago es una venta real (`sale`) por **USD 1.00 total**, con `tax=0.00` en esta operación de certificación sin tour. El backend fija los importes y el procesador `70608880`; rechaza cantidades, monedas u otros campos adicionales enviados por el cliente. Esto no cambia el cálculo fiscal de las reservas.

La selección Visa/Mastercard/Amex es una **marca declarada por el operador**, no una identificación verificada de la tarjeta. Comparar la marca y los resultados con el portal BAC antes de enviar la evidencia para certificación.

## Preparación de entorno

La implementación se prepara en development. No basta con publicar la web: requiere aplicar `202611100001_bac_certification.sql` y desplegar `admin-bac-certification` en el backend elegido. Como el proyecto actual comparte Supabase con producción, no aplicar esta migración ni habilitar cargos como efecto de un Preview sin revisar el entorno.

El interruptor servidor `BAC_CERTIFICATION_ENABLED` debe ser exactamente `true` para preparar o cobrar. Si está ausente, el historial y la conciliación siguen disponibles, pero no se crean ni cobran pruebas. No modifica la activación del método BAC público. Las claves Token/CHECKOUT del frontend y las credenciales privadas de Supabase deben corresponder al mismo gateway y comercio.

La configuración de credenciales productivas implica cargos reales incluso desde una rama development o un despliegue Preview. La implementación y sus pruebas automatizadas no realizan cargos reales.

## Flujo manual

1. Revisar el historial y el portal para no repetir una prueba ya aprobada. Comprobar si existen aprobaciones externas previas antes de usar esta herramienta; no se importan automáticamente.
2. Elegir la marca, escribir nombre/correo del titular y confirmar su autorización para USD 1.00.
3. Preparar el formulario. Esto aún no cobra. El formulario vence a los 30 minutos.
4. El titular introduce la tarjeta en los iframes de NMI y realiza el pago y 3DS. No compartir números ni CVV por chat.
5. Guardar la referencia, fecha/hora, monto, Transaction ID, código de autorización y marca confirmada en BAC. El botón de copiar evidencia solo copia aprobaciones; no envía ningún correo.
6. Solicitar a BAC el visto bueno. Gestionar anulaciones/reembolsos de estas pruebas desde el portal BAC; no están vinculadas al panel de reservas.
7. Deshabilitar `BAC_CERTIFICATION_ENABLED` al terminar.

## Duplicados y resultados inciertos

Una única fila activa por marca (`prepared`, `processing` o `paid`). La transición a `processing` se bloquea en PostgreSQL y solo puede reclamarla el administrador que preparó el formulario. Un pago aprobado impide nuevas pruebas de esa marca. Máximo tres intentos por marca en el registro, incluidos los rechazados.

Ante timeout, respuesta inválida o fallo al guardar una aprobación, el estado permanece `processing`: no hay reintentos automáticos, ni siquiera al recargar. Pasados dos minutos, un administrador puede registrar manualmente el resultado ya verificado en BAC. Una conciliación aprobada requiere Transaction ID; toda conciliación guarda operador y nota. La conciliación no consulta al proveedor: la comprobación manual en su portal es obligatoria y no debe marcarse como fallida una operación aún pendiente.

Solo se persisten campos limitados de evidencia. Nunca se guarda el token, PAN, CVV, CAVV ni la respuesta completa. Las tablas y RPC no tienen permisos para `anon` o `authenticated`; el acceso pasa por la función autenticada.

## Validación local

`node tests/bac-certification.test.mjs`: autenticación, importe fijo, duplicados, errores de red, conciliación, permisos SQL, vencimiento y límites con PostgreSQL en memoria y gateway simulado.

`node tests/bac-certification-ui.test.mjs`: requiere Vite con URL Supabase ficticia `https://admin-test.supabase.co`, claves BAC públicas ficticias válidas y `VITE_BAC_GATEWAY_URL=https://secure.nmi.com`. Los scripts de NMI y las respuestas de pago se interceptan; no contacta al gateway. Por defecto usa `http://localhost:5175` (configurable con `ADMIN_TEST_BASE_URL`).
