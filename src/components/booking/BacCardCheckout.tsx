import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BAC_CURRENCY } from '../../utils/bacConfig';
import { splitFullName } from '../../utils/bookingPayment';
import {
  BacPaymentError,
  getBacConfig,
  loadBacScripts,
  processBacPayment,
  type BacPaymentResult,
  type BacThreeDSecureResult,
} from '../../services/bacPaymentService';
import type { BookingResult } from '../../services/bookingService';
import { Button } from '../ui';

type CheckoutState = 'loading' | 'ready' | 'authenticating' | 'processing' | 'locked' | 'unavailable';

interface BacCardCheckoutProps {
  createdBooking: BookingResult;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  language: 'es' | 'en';
  onSuccess: (result: BacPaymentResult) => void;
}

const FIELD_IDS = { ccnumber: 'bac-ccnumber', ccexp: 'bac-ccexp', cvv: 'bac-cvv' } as const;
const THREE_DS_MOUNT_ID = 'bac-three-ds-mount';

export function BacCardCheckout({ createdBooking, customerName, customerEmail, customerPhone, language, onSuccess }: BacCardCheckoutProps) {
  const es = language === 'es';
  const [state, setState] = useState<CheckoutState>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const onSuccessRef = useRef(onSuccess);
  const inFlightRef = useRef(false);
  onSuccessRef.current = onSuccess;

  const amount = Number(createdBooking.total_snapshot).toFixed(2);
  const currency = createdBooking.currency || 'USD';

  useEffect(() => {
    let mounted = true;
    const config = getBacConfig();
    if (!config.configured || currency !== BAC_CURRENCY) {
      setState('unavailable');
      setError(es ? 'El pago con tarjeta no está disponible en este momento. Elige otro método de pago.' : 'Card payment is not available right now. Please choose another payment method.');
      return;
    }
    if (config.isMock) {
      setState('ready');
      return;
    }

    function fail(message: string) {
      if (!mounted) return;
      inFlightRef.current = false;
      setError(message);
      setState('ready');
    }

    async function settle(paymentToken: string, authentication: BacThreeDSecureResult) {
      if (!mounted) return;
      setState('processing');
      if (authentication.cardHolderInfo) setNotice(authentication.cardHolderInfo);
      try {
        const result = await processBacPayment(createdBooking.booking_id, paymentToken, authentication);
        if (mounted) onSuccessRef.current(result);
      } catch (paymentError) {
        if (!mounted) return;
        inFlightRef.current = false;
        setError(paymentError instanceof Error ? paymentError.message : String(paymentError));
        setState(paymentError instanceof BacPaymentError && paymentError.retryable ? 'ready' : 'locked');
      }
    }

    function authenticate(paymentToken: string) {
      const gateway = window.Gateway!.create(config.checkoutKey);
      gateway.on('error', () => fail(es ? 'No se pudo verificar la tarjeta. Inténtalo de nuevo.' : 'The card could not be verified. Please try again.'));
      const { firstName, lastName } = splitFullName(customerName);
      const threeDS = gateway.get3DSecure().createUI({
        paymentToken,
        currency,
        amount,
        firstName,
        lastName,
        email: customerEmail.trim(),
        ...(customerPhone.trim() ? { phone: customerPhone.trim() } : {}),
      });
      threeDS.on('challenge', () => { if (mounted) setNotice(es ? 'Tu banco solicita una verificación adicional.' : 'Your bank is requesting additional verification.'); });
      threeDS.on('complete', (event) => { void settle(paymentToken, event as BacThreeDSecureResult); });
      threeDS.on('failure', () => fail(es ? 'Tu banco no pudo autenticar la tarjeta. Intenta con otra tarjeta.' : 'Your bank could not authenticate the card. Please try another card.'));
      threeDS.on('error', () => fail(es ? 'No se pudo completar la verificación 3-D Secure.' : '3-D Secure verification could not be completed.'));
      threeDS.start(`#${THREE_DS_MOUNT_ID}`);
    }

    loadBacScripts()
      .then(() => {
        if (!mounted) return;
        window.CollectJS!.configure({
          variant: 'inline',
          fields: {
            ccnumber: { selector: `#${FIELD_IDS.ccnumber}`, title: es ? 'Número de tarjeta' : 'Card number', placeholder: '0000 0000 0000 0000' },
            ccexp: { selector: `#${FIELD_IDS.ccexp}`, title: es ? 'Vencimiento' : 'Expiration', placeholder: 'MM / YY' },
            cvv: { selector: `#${FIELD_IDS.cvv}`, title: 'CVV', placeholder: 'CVV' },
          },
          fieldsAvailableCallback: () => { if (mounted) setState('ready'); },
          timeoutDuration: 15000,
          timeoutCallback: () => fail(es ? 'La validación de la tarjeta tardó demasiado. Inténtalo de nuevo.' : 'Card validation timed out. Please try again.'),
          callback: (response) => {
            if (!mounted || !response?.token) return;
            setState('authenticating');
            authenticate(response.token);
          },
        });
      })
      .catch((loadError: Error) => {
        if (!mounted) return;
        setState('unavailable');
        setError(loadError.message);
      });

    return () => { mounted = false; };
    // The gateway iframes are configured once per booking; re-running on
    // language or customer edits would tear down the card fields mid-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdBooking.booking_id]);

  function handlePay() {
    // Terms were already accepted (and stored) before the booking was created.
    if (state !== 'ready' || inFlightRef.current) return;
    inFlightRef.current = true;
    setError('');
    setNotice('');
    if (getBacConfig().isMock) {
      setState('processing');
      processBacPayment(createdBooking.booking_id, 'MOCK-APPROVE-TOKEN', { cavv: 'MOCKCAVV', eci: '05', cardHolderAuth: 'verified', threeDsVersion: '2.2.0' })
        .then((result) => onSuccessRef.current(result))
        .catch((paymentError: Error) => {
          inFlightRef.current = false;
          setError(paymentError.message);
          setState(paymentError instanceof BacPaymentError && paymentError.retryable ? 'ready' : 'locked');
        });
      return;
    }
    window.CollectJS?.startPaymentRequest();
  }

  const busy = state === 'authenticating' || state === 'processing';
  const fieldBox = 'min-h-[44px] rounded-lg border border-white/20 bg-white px-3 py-2';

  return (
    <div className="mt-4 rounded-lg border border-ocean-400/20 bg-ocean-900/35 px-3 py-3 sm:px-4" data-testid="bac-card-checkout">
      <div className="mx-auto w-full max-w-md">
        <p className="flex items-center gap-2 text-sm font-extrabold text-white"><Lock size={15} /> {es ? 'Pago seguro con tarjeta' : 'Secure card payment'}</p>
        <p className="mt-0.5 text-xs font-medium text-ocean-300">
          {es ? `Total a pagar: ${currency} ${amount}. Procesado por BAC Credomatic con 3-D Secure.` : `Amount due: ${currency} ${amount}. Processed by BAC Credomatic with 3-D Secure.`}
        </p>

        {state !== 'unavailable' ? (
          <div className={state === 'locked' ? 'pointer-events-none opacity-50' : undefined}>
            {/* Gateway-owned iframes are injected into these empty nodes; React must never render children here. */}
            <label className="mt-3 block text-xs font-bold uppercase tracking-[0.12em] text-ocean-400" htmlFor={FIELD_IDS.ccnumber}>{es ? 'Número de tarjeta' : 'Card number'}</label>
            <div id={FIELD_IDS.ccnumber} className={`mt-1 ${fieldBox}`} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ocean-400" htmlFor={FIELD_IDS.ccexp}>{es ? 'Vencimiento' : 'Expiration'}</label>
                <div id={FIELD_IDS.ccexp} className={`mt-1 ${fieldBox}`} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-ocean-400" htmlFor={FIELD_IDS.cvv}>CVV</label>
                <div id={FIELD_IDS.cvv} className={`mt-1 ${fieldBox}`} />
              </div>
            </div>
            <div id={THREE_DS_MOUNT_ID} className="mt-3" />

            <Button className="mt-3" fullWidth type="button" disabled={state !== 'ready'} aria-busy={busy || undefined} onClick={handlePay}>
              {state === 'loading' ? (es ? 'Cargando formulario seguro...' : 'Loading secure form...')
                : state === 'authenticating' ? (es ? 'Verificando con tu banco...' : 'Verifying with your bank...')
                  : state === 'processing' ? (es ? 'Procesando pago...' : 'Processing payment...')
                    : (es ? `Pagar ${currency} ${amount}` : `Pay ${currency} ${amount}`)}
            </Button>
          </div>
        ) : null}

        {notice ? <p className="mt-3 text-xs text-ocean-200" role="status">{notice}</p> : null}
        {error ? (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
            <p className="font-bold">{es ? 'No se pudo completar el pago' : 'Payment could not be completed'}</p>
            <p className="mt-1">{error}</p>
            {state === 'locked' ? <p className="mt-1">{es ? `Referencia: ${createdBooking.booking_reference}` : `Reference: ${createdBooking.booking_reference}`}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
