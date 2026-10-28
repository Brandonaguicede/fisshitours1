# Pago con tarjeta BAC Credomatic

Integración basada en los pasos que indicó BAC (plataforma NMI):

1. **Gateway.js / Collect.js** (navegador): la tarjeta se escribe en iframes del gateway y se convierte en un `payment_token` de un solo uso.
2. **Payer Authentication 3DS** (navegador): Gateway.js autentica ese token con el banco emisor y devuelve `cavv`, `eci`, `cardHolderAuth`, `threeDsVersion`, `directoryServerId` y, a veces, `xid`.
3. **Process** (servidor): la Edge Function `bac-process-payment` ejecuta la venta (`type=sale`) en la Payment API con la llave **privada**.

## Flujo

```
Cliente elige "Tarjeta" -> create-booking (pending_payment, retención 30 min)
  -> Collect.js tokeniza -> Gateway.js 3DS (posible desafío del banco)
  -> bac-process-payment { bookingId, paymentToken, threeDSecure }
       begin_bac_payment_attempt   (bloquea la reserva, máx. 3 intentos)
       POST /api/transact.php      (monto y orderid leídos de la reserva)
       complete_bac_payment_attempt (pagado+confirmado o vuelve a pendiente)
  -> correo de confirmación en cola
```

## Seguridad

- **Datos de tarjeta:** nunca pasan por este proyecto. Solo viaja un token de un solo uso.
- **Monto:** siempre sale de `bookings.total_snapshot`. El navegador no puede elegirlo.
- **3-D Secure obligatorio:** el servidor rechaza pagos sin `cavv` válido y `cardholder_auth` en `verified` o `attempted`.
- **`cardHolderInfo`:** se muestra al cliente y nunca se envía a la Payment API, como pide NMI.
- **Doble cobro:** un índice único y el bloqueo de fila impiden dos ventas simultáneas para la misma reserva.
- **Resultado desconocido:** ante timeout o error de red, el intento queda en `processing`. No se reintenta ni se cancela solo.
- **Pruebas de tarjetas robadas:** máximo 3 intentos por reserva, más el límite de reservas por IP ya existente. Los rechazos devuelven un mensaje genérico.
- **Permisos:** las funciones SQL solo las puede ejecutar `service_role`. Se revocan para `anon` y `authenticated`.
- **Auditoría:** `payments.raw_response` guarda solo campos de una lista blanca. Nunca guarda token ni llave.
- **Confirmación manual:** el panel y `admin-confirm-booking` no permiten confirmar una reserva con tarjeta sin pago aprobado.

## Configuración

Secretos de Supabase (servidor), nunca en el frontend ni en git:

```
supabase secrets set BAC_SECURITY_KEY=<llave privada del portal BAC>
supabase secrets set BAC_GATEWAY_URL=https://<dominio del gateway que indique BAC>
```

Variables de Vercel (frontend, son públicas por diseño):

```
VITE_BAC_PUBLIC_KEY=<llave pública con permiso Checkout / tokenización>
VITE_BAC_GATEWAY_URL=https://<mismo dominio del gateway>
```

`VITE_BAC_PUBLIC_KEY=mock` activa un modo simulado que solo funciona con `MOCK_EXTERNAL_PROVIDERS=true` en Supabase local.

## Puesta en marcha

1. Aplicar la migración `202610280001_bac_card_payments.sql`.
2. Desplegar `bac-process-payment`, `create-booking`, `get-booking-availability` y `admin-confirm-booking`.
3. Configurar secretos y variables con las llaves **sandbox** de BAC.
4. Activar "Credit or debit card" en Admin > Métodos de pago.
5. Hacer las pruebas de certificación y enviarlas a BAC.
6. Cambiar a llaves de producción solo después del visto bueno de BAC.

## Pruebas de certificación que pide BAC

Hacer al menos una venta aprobada y una rechazada con cada marca, usando las tarjetas de prueba que entregue BAC:

| Marca | Aprobada | Rechazada | Con desafío 3DS |
|---|---|---|---|
| Visa | | | |
| Mastercard | | | |
| American Express | | | |

Anotar en cada fila la referencia de reserva y el `transactionid` del gateway.

## Conciliación de pagos en `processing`

Si una reserva queda con pago `processing` por más de unos minutos:

1. Buscar la referencia de reserva en el portal BAC. El campo `orderid` es esa referencia.
2. Buscar el intento con `select id from payments where provider = 'bac' and status = 'processing' and booking_id = '<id>'`.
3. Registrar el resultado real desde el SQL Editor de Supabase. Usar `true` si la venta aparece aprobada y `false` si no aparece:

```sql
select complete_bac_payment_attempt('<id del intento>', true, '<transactionid>', <total>, 'USD', 'Conciliado manualmente', '{"source":"manual-reconciliation"}');
```

Todavía no existe una pantalla de admin para esto.

## Por confirmar con BAC

- **Dominio del gateway:** confirmar el host exacto para scripts y Payment API en sandbox y producción.
- **Llaves:** confirmar que una sola llave pública sirve para Collect.js y Gateway.js.
- **API:** el paso 3 apunta a la Payment API clásica (`transact.php`). NMI recomienda la REST v5 para integraciones nuevas, así que conviene confirmar cuál certifica BAC.
- **Términos y condiciones:** `/terminos` muestra la versión vigente de `supabase/functions/_shared/terms.mjs`, el mismo texto del modal y del correo. Hoy la v1 solo menciona comisiones de transferencia y PayPal. Si BAC pide texto sobre pagos con tarjeta o reembolsos a la tarjeta, el cliente debe aprobar una v2. Las versiones publicadas no se editan.
