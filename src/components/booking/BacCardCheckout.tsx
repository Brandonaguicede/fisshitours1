import { CreditCard, Lock } from 'lucide-react';
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

type CheckoutState = 'loading' | 'ready' | 'tokenizing' | 'authenticating' | 'processing' | 'locked' | 'unavailable';

interface BacCardCheckoutProps {
  createdBooking: Pick<BookingResult, 'booking_id' | 'booking_reference' | 'total_snapshot' | 'currency'>;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  language: 'es' | 'en';
  onSuccess: (result: BacPaymentResult) => void;
  onBlockedChange: (blocked: boolean) => void;
  submitPayment?: typeof processBacPayment;
}

const FIELD_IDS = { ccnumber: 'bac-ccnumber', ccexp: 'bac-ccexp', cvv: 'bac-cvv' } as const;
const THREE_DS_MOUNT_ID = 'bac-three-ds-mount';

export function BacCardCheckout({ createdBooking, customerName, customerEmail, customerPhone, language, onSuccess, onBlockedChange, submitPayment = processBacPayment }: BacCardCheckoutProps) {
  const es = language === 'es';
  const [state, setState] = useState<CheckoutState>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const onSuccessRef = useRef(onSuccess);
  const inFlightRef = useRef(false);
  const submittedRef = useRef(false);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    onBlockedChange(['tokenizing', 'authenticating', 'processing', 'locked'].includes(state));
  }, [state, onBlockedChange]);

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

    let fieldsReady = false;
    const loadingTimeout = window.setTimeout(() => {
      if (!mounted || fieldsReady) return;
      setState('unavailable');
      setError(es
        ? 'No pudimos cargar los campos seguros de BAC. Contáctanos o elige otro método de pago.'
        : 'We could not load the secure BAC fields. Please contact us or choose another payment method.');
    }, 20000);

    function fail(message: string) {
      if (!mounted || submittedRef.current) return;
      inFlightRef.current = false;
      setError(message);
      setState('ready');
    }

    async function settle(paymentToken: string, authentication: BacThreeDSecureResult) {
      if (!mounted || submittedRef.current) return;
      submittedRef.current = true;
      setState('processing');
      if (authentication.cardHolderInfo) setNotice(authentication.cardHolderInfo);
      try {
        const result = await submitPayment(createdBooking.booking_id, paymentToken, authentication);
        if (mounted) onSuccessRef.current(result);
      } catch (paymentError) {
        if (!mounted) return;
        inFlightRef.current = false;
        if (paymentError instanceof BacPaymentError && paymentError.retryable) submittedRef.current = false;
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
          styleSniffer: false,
          customCss: {
            'background-color': '#ffffff',
            color: '#153349',
            'font-family': 'Arial, sans-serif',
            'font-size': '16px',
            'line-height': '28px',
            'border-width': '0px',
            'border-radius': '0px',
          },
          placeholderCss: { color: '#526779', 'background-color': '#ffffff' },
          focusCss: { color: '#153349', 'background-color': '#ffffff' },
          invalidCss: { color: '#b42318', 'background-color': '#fff4f2' },
          fields: {
            ccnumber: { selector: `#${FIELD_IDS.ccnumber}`, title: es ? 'Número de tarjeta' : 'Card number', placeholder: '0000 0000 0000 0000' },
            ccexp: { selector: `#${FIELD_IDS.ccexp}`, title: es ? 'Vencimiento' : 'Expiration', placeholder: 'MM / YY' },
            cvv: { selector: `#${FIELD_IDS.cvv}`, title: 'CVV', placeholder: 'CVV' },
          },
          fieldsAvailableCallback: () => {
            fieldsReady = true;
            window.clearTimeout(loadingTimeout);
            if (mounted) { setError(''); setState('ready'); }
          },
          timeoutDuration: 15000,
          timeoutCallback: () => fail(es ? 'La validación de la tarjeta tardó demasiado. Inténtalo de nuevo.' : 'Card validation timed out. Please try again.'),
          validationCallback: (_field, valid) => {
            if (!valid) fail(es ? 'Revisa el número, vencimiento y código de seguridad de la tarjeta.' : 'Please check your card number, expiration and security code.');
          },
          callback: (response) => {
            if (!mounted || !inFlightRef.current || submittedRef.current) return;
            if (!response?.token) { fail(es ? 'No se pudo validar la tarjeta. Revisa los datos.' : 'The card could not be validated. Please check the details.'); return; }
            setState('authenticating');
            try { authenticate(response.token); }
            catch { fail(es ? 'No se pudo iniciar la verificación bancaria.' : 'Bank verification could not be started.'); }
          },
        });
      })
      .catch((loadError: Error) => {
        window.clearTimeout(loadingTimeout);
        if (!mounted) return;
        setState('unavailable');
        setError(loadError.message);
      });

    return () => { mounted = false; window.clearTimeout(loadingTimeout); };
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
      submitPayment(createdBooking.booking_id, 'MOCK-APPROVE-TOKEN', { cavv: 'MOCKCAVV', eci: '05', cardHolderAuth: 'verified', threeDsVersion: '2.2.0' })
        .then((result) => onSuccessRef.current(result))
        .catch((paymentError: Error) => {
          inFlightRef.current = false;
          setError(paymentError.message);
          setState(paymentError instanceof BacPaymentError && paymentError.retryable ? 'ready' : 'locked');
        });
      return;
    }
    setState('tokenizing');
    try {
      if (!window.CollectJS) throw new Error('Card form unavailable');
      window.CollectJS.startPaymentRequest();
    } catch {
      inFlightRef.current = false;
      setState('unavailable');
      setError(es ? 'No se pudo cargar el formulario seguro. Recarga la página antes de intentarlo de nuevo.' : 'The secure form is unavailable. Reload the page before trying again.');
    }
  }

  const busy = state === 'tokenizing' || state === 'authenticating' || state === 'processing';
  const fieldBox = 'min-h-[52px] rounded-xl border border-ocean-200/40 bg-white px-4 py-3 transition-colors focus-within:border-ocean-400 [&>iframe]:block [&>iframe]:w-full';

  return (
    <div className="mt-5 rounded-2xl border border-ocean-400/25 bg-ocean-950/60 px-5 py-6 sm:p-7" data-testid="bac-card-checkout">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-white"><Lock size={18} aria-hidden="true" /> {es ? 'Pago seguro con tarjeta' : 'Secure card payment'}</h3>
            <p className="mt-1 text-sm text-ocean-200">BAC Credomatic</p>
          </div>
          <CreditCard size={28} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ocean-300" />
        </div>
        <div className="my-5 flex flex-wrap items-baseline justify-between gap-2 border-y border-white/10 py-4">
          <span className="text-sm text-ocean-100">{es ? 'Total a pagar' : 'Amount due'}</span>
          <span className="text-2xl font-bold tabular-nums text-white"><span className="mr-2 text-sm font-medium text-ocean-200">{currency}</span>{amount}</span>
        </div>
        <div className="mb-5">
          <p className="mb-2 text-sm text-ocean-200">{es ? 'Aceptamos estas tarjetas' : 'We accept these cards'}</p>
          <img
            src="/galeria/bac.png"
            width={520}
            height={90}
            alt="BAC Credomatic · American Express · Mastercard · Visa · Discover · JCB · Diners Club"
            className="block h-auto w-full rounded-lg bg-white"
          />
        </div>

        {state !== 'unavailable' ? (
          <div className={state === 'locked' ? 'pointer-events-none opacity-50' : undefined}>
            {/* Gateway-owned iframes are injected into these empty nodes; React must never render children here. */}
            <label className="block text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.ccnumber}>{es ? 'Número de tarjeta' : 'Card number'}</label>
            <div id={FIELD_IDS.ccnumber} className={`mt-2 ${fieldBox}`} />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.ccexp}>{es ? 'Vencimiento' : 'Expiration'}</label>
                <div id={FIELD_IDS.ccexp} className={`mt-2 ${fieldBox}`} />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.cvv}>CVV</label>
                <div id={FIELD_IDS.cvv} className={`mt-2 ${fieldBox}`} />
              </div>
            </div>
            <div id={THREE_DS_MOUNT_ID} className="mt-3" />

            <Button className="mt-5 min-h-[48px]" fullWidth type="button" disabled={state !== 'ready'} aria-busy={busy || undefined} onClick={handlePay}>
              {state === 'loading' ? (es ? 'Cargando formulario seguro...' : 'Loading secure form...')
                : state === 'tokenizing' ? (es ? 'Validando tarjeta...' : 'Validating card...')
                : state === 'authenticating' ? (es ? 'Verificando con tu banco...' : 'Verifying with your bank...')
                  : state === 'processing' ? (es ? 'Procesando pago...' : 'Processing payment...')
                    : (es ? `Pagar ${currency} ${amount}` : `Pay ${currency} ${amount}`)}
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-ocean-200">{es ? 'Tu banco puede solicitar una verificación adicional para autorizar el pago.' : 'Your bank may request additional verification to authorize your payment.'}</p>
            {busy ? <p className="mt-2 text-sm text-ocean-100" role="status">{es ? 'Mantén esta página abierta mientras verificamos el pago.' : 'Keep this page open while we verify your payment.'}</p> : null}
          </div>
        ) : null}

        {notice ? <p className="mt-3 text-xs text-ocean-200" role="status">{notice}</p> : null}
        {error ? (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
            <p className="font-bold">{es ? 'No se pudo completar el pago' : 'Payment could not be completed'}</p>
            <p className="mt-1">{error}</p>
            {state === 'locked' ? <p className="mt-1">{es ? `No vuelvas a pagar hasta que confirmemos el resultado. Contáctanos con la referencia: ${createdBooking.booking_reference}` : `Do not pay again until we confirm the result. Contact us with reference: ${createdBooking.booking_reference}`}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
