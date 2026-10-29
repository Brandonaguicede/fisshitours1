# Pago con tarjeta BAC Credomatic

Integración basada en los pasos que indicó BAC (plataforma NMI):

1. **Gateway.js / Collect.js** (navegador): la tarjeta se escribe en iframes del gateway y se convierte en un `payment_token` de un solo uso.
2. **Payer Authentication 3DS** (navegador): Gateway.js autentica ese token con el banco emisor y devuelve `cavv`, `eci`, `cardHolderAuth`, `threeDsVersion`, `directoryServerId` y, a veces, `xid`.
3. **Process** (servidor): la Payment API se llama solo desde Edge Functions, con la llave **privada**.
4. **Métodos básicos** que BAC certifica, todos implementados:

| Método NMI | Dónde se usa | Quién lo ejecuta |
|---|---|---|
| Credit Card - Sale (`sale`) | Checkout del cliente, modo por defecto | `bac-process-payment` |
| Credit Card - Authorize (`auth`) | Checkout del cliente con `BAC_TRANSACTION_TYPE=auth` | `bac-process-payment` |
| Credit Card - Capture (`capture`) | Botón **Capturar** en Admin > Reservas | `admin-bac-transaction` |
| Void Transaction (`void`) | Botón **Anular** en Admin > Reservas | `admin-bac-transaction` |
| Refund Transaction (`refund`) | Botón **Reembolsar** en Admin > Reservas, total o parcial | `admin-bac-transaction` |

## Flujos

**Venta (por defecto):**
```
Cliente elige "Tarjeta" -> create-booking (pending_payment, retención 30 min)
  -> Collect.js tokeniza -> Gateway.js 3DS -> bac-process-payment (type=sale)
  -> pagada + confirmada -> Google Calendar + correo de confirmación
```

**Autorización y captura (`BAC_TRANSACTION_TYPE=auth`):**
```
... -> bac-process-payment (type=auth) -> pago "Autorizado", reserva "Por confirmar"
  -> Admin: Capturar -> pagada + confirmada -> Google Calendar + correo
  -> o Admin: Anular -> fondos liberados, reserva cancelada, horario libre
```

**Después de cobrar:**
- **Anular:** solo funciona antes de la liquidación diaria de BAC. Cancela la reserva y libera el horario.
- **Reembolsar:** sirve después de la liquidación. Permite montos parciales que se acumulan hasta lo cobrado. La reserva no se cancela sola.

## Reglas de cada operación

| Operación | Requiere | Resultado |
|---|---|---|
| Capturar | Pago "Autorizado" | Monto autorizado completo, reserva confirmada |
| Anular | Pago "Autorizado" o "Pagado" sin reembolsos | Pago "Anulado", reserva cancelada |
| Reembolsar | Pago "Pagado" | Monto entre 0.01 y lo cobrado menos lo ya reembolsado |

- **Captura parcial:** no se permite. NMI la acepta, pero dejaría el total de la reserva distinto de lo cobrado.
- **Cancelar una reserva autorizada:** el panel lo bloquea. Hay que anular primero para no dejar el dinero retenido en la tarjeta.
- **Monto 0.00 en reembolso:** NMI lo interpreta como reembolso total, así que el servidor lo rechaza.

## Seguridad

- **Datos de tarjeta:** nunca pasan por este proyecto. Solo viaja un token de un solo uso.
- **Montos:** siempre salen de la base. El navegador no elige el monto de venta ni de captura. El de reembolso se valida contra el saldo.
- **Transacción original:** captura, anulación y reembolso toman el `transactionid` del registro en `payments`, nunca del navegador.
- **3-D Secure obligatorio:** el servidor rechaza ventas y autorizaciones sin `cavv` válido y `cardholder_auth` en `verified` o `attempted`.
- **Una operación a la vez:** cada llamada al gateway es una fila `processing` en `payments`. Un índice único y el bloqueo de fila impiden dos llamadas simultáneas por reserva.
- **Resultado desconocido:** ante timeout o error de red, la fila queda en `processing` y bloquea nuevas operaciones hasta conciliarla. Nunca se reintenta sola.
- **Pruebas de tarjetas robadas:** máximo 3 intentos de pago por reserva y mensajes de rechazo genéricos al cliente.
- **Permisos:** capturar, anular y reembolsar exige un perfil `admin` activo. Los editores no ven esos botones y el servidor responde 403.
- **Funciones SQL:** solo las ejecuta `service_role`. Se revocan para `anon` y `authenticated`.
- **Auditoría:** cada operación guarda quién la hizo, en `raw_response.actor` y en el historial de la reserva. Solo se guardan campos de una lista blanca, nunca el token ni la llave.

## Configuración

Secretos de Supabase (servidor), nunca en el frontend ni en git:

```
npx supabase secrets set BAC_SECURITY_KEY=<llave privada> BAC_GATEWAY_URL=https://<dominio del gateway>
npx supabase secrets set BAC_TRANSACTION_TYPE=sale   # o auth para autorizar y capturar después
npx supabase secrets set BAC_PROCESSOR_ID=<processor id que asignó BAC>
```

Variables de Vercel (frontend, son públicas por diseño):

```
VITE_BAC_TOKENIZATION_KEY=<llave "Token" de BAC>
VITE_BAC_CHECKOUT_KEY=<llave "CHECKOUT" de BAC, empieza con checkout_public_>
VITE_BAC_GATEWAY_URL=https://<mismo dominio del gateway>
```

BAC entrega tres credenciales y cada una tiene un solo uso:

| Credencial de BAC | Variable | Dónde se usa |
|---|---|---|
| Private Security Key | `BAC_SECURITY_KEY` (Supabase) | Payment API: sale, auth, capture, void y refund |
| Token | `VITE_BAC_TOKENIZATION_KEY` (Vercel) | `data-tokenization-key` de Collect.js |
| CHECKOUT (`checkout_public_…`) | `VITE_BAC_CHECKOUT_KEY` (Vercel) | `Gateway.create()` de Gateway.js, para 3-D Secure |

- **Dominio:** solo el dominio con `https://` y sin `/` al final. El código agrega `/token/Collect.js`, `/js/v1/Gateway.js` y `/api/transact.php`.
- **Llaves cruzadas:** si falta una de las dos llaves públicas o vienen intercambiadas, el método se muestra como no disponible en lugar de fallar a mitad del pago.
- **Processor ID:** según la Payment API de NMI, `processor_id` enruta la transacción al procesador (MID) indicado y solo existe en sale y auth. Capture, void y refund no lo llevan porque se ejecutan sobre la transacción original, que ya tiene su procesador. Si `BAC_PROCESSOR_ID` tiene un formato inválido, la función responde 503 y no cobra.
- **Moneda:** la cuenta de BAC es solo en USD (contado). Una reserva en otra moneda se rechaza con 422 antes de abrir el intento, así que no queda ninguna fila "processing". El formulario de tarjeta tampoco se muestra.
- **Modo simulado:** `VITE_BAC_TOKENIZATION_KEY=mock` solo funciona con `MOCK_EXTERNAL_PROVIDERS=true` en Supabase local.

## Puesta en marcha

1. Aplicar las migraciones `202610280001_bac_card_payments.sql`, `202610290001_bac_basic_methods.sql` y `202610300001_bac_reconciliation.sql`.
2. Desplegar estas funciones:
```
npx supabase functions deploy bac-process-payment admin-bac-transaction create-booking get-booking-availability admin-confirm-booking admin-cancel-booking
```
3. Configurar secretos y variables con las llaves **sandbox** de BAC, y volver a desplegar en Vercel.
4. Activar "Credit or debit card" en Admin > Métodos de pago.
5. Hacer las pruebas de certificación y enviarlas a BAC.
6. Cambiar a llaves de producción solo después del visto bueno de BAC.

## Pruebas de certificación

Cada operación con cada marca, usando las tarjetas de prueba de BAC. Anotar la referencia de reserva y el `transactionid`.

| Operación | Visa | Mastercard | American Express |
|---|---|---|---|
| Sale aprobada | | | |
| Sale rechazada | | | |
| Sale con desafío 3DS | | | |
| Authorize (`BAC_TRANSACTION_TYPE=auth`) | | | |
| Capture de esa autorización | | | |
| Void de una autorización | | | |
| Void de una venta del día | | | |
| Refund total | | | |
| Refund parcial | | | |

Para probar autorizaciones, cambiar `BAC_TRANSACTION_TYPE=auth`, hacer esas filas y volver a `sale` si el negocio prefiere cobrar de inmediato.

## Avisos

- **Venta aprobada o captura:** el cliente recibe el correo de confirmación y la reserva se agenda en Google Calendar.
- **Autorización aprobada:** el admin recibe un aviso interno, "Pago con tarjeta autorizado, pendiente de captura". El cliente ve el resultado en pantalla y recibe su confirmación cuando se captura, igual que en el resto de métodos.
- **Anulación:** el evento de Google Calendar se elimina.
- **Reembolso:** no se reenvía nada.

## Conciliación de operaciones en `processing`

Si BAC no responde, la operación queda en "Procesando" y bloquea nuevas operaciones de esa reserva. Para resolverla:

1. Buscar la referencia de reserva en el portal BAC. El campo `orderid` es esa referencia.
2. En Admin > Reservas, usar **Conciliar** en esa reserva. El botón aparece cuando el pago está "Procesando" o cuando una operación responde que hay otra pendiente.
3. Elegir lo que muestra el portal:
   - **Aprobada:** escribir el Transaction ID de BAC.
   - **No aparece o fue rechazada:** no se escribe nada más.

**Reglas de la conciliación:**
- **Espera mínima:** se rechaza si la operación tiene menos de 2 minutos, porque podría seguir en curso.
- **Mismas reglas:** usa las mismas funciones que el flujo automático, con monto, estados y liberación del horario.
- **Auditoría:** queda registrado quién concilió, en `raw_response.actor` y en el historial de la reserva.

## Antes de activar el método en producción

- **Turnstile:** hoy `DISABLE_TURNSTILE=true` en los secretos de producción, así que la verificación antibots de `create-booking` está apagada. Con tarjetas activas, la única defensa contra pruebas de tarjetas robadas sería el límite por IP y los 3 intentos por reserva. Hay que configurar Turnstile con `VITE_TURNSTILE_SITE_KEY` en Vercel y `TURNSTILE_SECRET_KEY` en Supabase. Después hay que pasar `DISABLE_TURNSTILE` a `false` en Supabase y confirmar que `VITE_DISABLE_TURNSTILE` no sea `true` en Vercel.
- **Base de datos de pruebas:** solo hay un proyecto de Supabase. Para no probar sobre datos reales conviene crear un proyecto de pruebas y apuntar ahí las vistas previas de Vercel.

## Por confirmar con BAC

- **Dominio del gateway:** confirmar el host exacto para scripts y Payment API en sandbox y producción.
- **API:** el paso 3 apunta a la Payment API clásica (`transact.php`). NMI recomienda la REST v5 para integraciones nuevas, así que conviene confirmar cuál certifica BAC.
- **Validez de la autorización:** confirmar cuántos días dura una autorización antes de vencer en el banco emisor. El admin debe capturar o anular antes.
- **Términos y condiciones:** `/terminos` muestra la versión vigente de `supabase/functions/_shared/terms.mjs`, el mismo texto del modal y del correo. Hoy la v1 solo menciona comisiones de transferencia y PayPal. Si BAC pide texto sobre pagos con tarjeta o reembolsos a la tarjeta, el cliente debe aprobar una v2. Las versiones publicadas no se editan.
