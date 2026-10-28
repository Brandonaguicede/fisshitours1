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
```

Variables de Vercel (frontend, son públicas por diseño):

```
VITE_BAC_PUBLIC_KEY=<llave pública con permiso Checkout / tokenización>
VITE_BAC_GATEWAY_URL=https://<mismo dominio del gateway>
```

- **Dominio:** solo el dominio con `https://` y sin `/` al final. El código agrega `/token/Collect.js`, `/js/v1/Gateway.js` y `/api/transact.php`.
- **Modo simulado:** `VITE_BAC_PUBLIC_KEY=mock` solo funciona con `MOCK_EXTERNAL_PROVIDERS=true` en Supabase local.

## Puesta en marcha

1. Aplicar las migraciones `202610280001_bac_card_payments.sql` y `202610290001_bac_basic_methods.sql`.
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

## Conciliación de operaciones en `processing`

Si una operación queda en `processing` por más de unos minutos:

1. Buscar la referencia de reserva en el portal BAC. El campo `orderid` es esa referencia.
2. Buscar la fila con `select id, transaction_type from payments where provider = 'bac' and status = 'processing' and booking_id = '<id>'`.
3. Registrar el resultado real desde el SQL Editor de Supabase. Usar `true` si BAC la muestra aprobada y `false` si no aparece:

```sql
-- Venta o autorización del cliente:
select complete_bac_payment_attempt('<id>', true, '<transactionid>', <total>, 'USD', 'Conciliado manualmente', '{"source":"manual-reconciliation"}');
-- Captura, anulación o reembolso del admin:
select complete_bac_admin_operation('<id>', true, '<transactionid>', 'Conciliado manualmente', '{"source":"manual-reconciliation"}');
```

Todavía no existe una pantalla de admin para conciliar.

## Por confirmar con BAC

- **Dominio del gateway:** confirmar el host exacto para scripts y Payment API en sandbox y producción.
- **Llaves:** confirmar que una sola llave pública sirve para Collect.js y Gateway.js.
- **API:** el paso 3 apunta a la Payment API clásica (`transact.php`). NMI recomienda la REST v5 para integraciones nuevas, así que conviene confirmar cuál certifica BAC.
- **Validez de la autorización:** confirmar cuántos días dura una autorización antes de vencer en el banco emisor. El admin debe capturar o anular antes.
- **Términos y condiciones:** `/terminos` muestra la versión vigente de `supabase/functions/_shared/terms.mjs`, el mismo texto del modal y del correo. Hoy la v1 solo menciona comisiones de transferencia y PayPal. Si BAC pide texto sobre pagos con tarjeta o reembolsos a la tarjeta, el cliente debe aprobar una v2. Las versiones publicadas no se editan.
