import { CalendarDays, CreditCard, Info, Lock, ShieldCheck } from 'lucide-react';
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
  createdBooking: BookingResult;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  language: 'es' | 'en';
  onSuccess: (result: BacPaymentResult) => void;
  onBlockedChange: (blocked: boolean) => void;
}

const FIELD_IDS = { ccnumber: 'bac-ccnumber', ccexp: 'bac-ccexp', cvv: 'bac-cvv' } as const;
const THREE_DS_MOUNT_ID = 'bac-three-ds-mount';

export function BacCardCheckout({ createdBooking, customerName, customerEmail, customerPhone, language, onSuccess, onBlockedChange }: BacCardCheckoutProps) {
  const es = language === 'es';
  const [state, setState] = useState<CheckoutState>('loading');
  const [error, setError] = useState('');
  const [fieldValidationError, setFieldValidationError] = useState(false);
  const [notice, setNotice] = useState('');
  const onSuccessRef = useRef(onSuccess);
  const inFlightRef = useRef(false);
  const submittedRef = useRef(false);
  const collectingRef = useRef(false);
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
      collectingRef.current = false;
      setFieldValidationError(false);
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
        const result = await processBacPayment(createdBooking.booking_id, paymentToken, authentication);
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
            // Hosted fields also validate on load/blur. Only report errors for an explicit payment attempt.
            if (!mounted || !collectingRef.current || submittedRef.current) return;
            if (!valid) {
              fail(es ? 'Completa o corrige el número, vencimiento y código de seguridad de la tarjeta antes de pagar.' : 'Complete or correct your card number, expiration and security code before paying.');
              setFieldValidationError(true);
            }
          },
          callback: (response) => {
            if (!mounted || !inFlightRef.current || submittedRef.current) return;
            collectingRef.current = false;
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
    setFieldValidationError(false);
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
    setState('tokenizing');
    collectingRef.current = true;
    try {
      if (!window.CollectJS) throw new Error('Card form unavailable');
      window.CollectJS.startPaymentRequest();
    } catch {
      collectingRef.current = false;
      inFlightRef.current = false;
      setState('unavailable');
      setError(es ? 'No se pudo cargar el formulario seguro. Recarga la página antes de intentarlo de nuevo.' : 'The secure form is unavailable. Reload the page before trying again.');
    }
  }

  const busy = state === 'tokenizing' || state === 'authenticating' || state === 'processing';
  const fieldBox = 'min-h-[52px] rounded-xl border border-ocean-200/40 bg-white px-4 py-3 transition-colors focus-within:border-ocean-300 focus-within:ring-2 focus-within:ring-ocean-300/50 [&>iframe]:block [&>iframe]:w-full';

  return (
    <div className="mt-5 rounded-2xl border border-ocean-400/25 bg-ocean-950/60 px-5 py-6 sm:p-7" data-testid="bac-card-checkout">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ocean-300/40 bg-ocean-400/10 text-ocean-200"><Lock size={20} aria-hidden="true" /></span>
            <div>
              <h3 className="text-lg font-bold leading-tight text-white">{es ? 'Pago seguro con tarjeta' : 'Secure card payment'}</h3>
              <p className="mt-0.5 text-sm text-ocean-200">{es ? 'Transacción protegida y encriptada · BAC Credomatic' : 'Protected, encrypted transaction · BAC Credomatic'}</p>
            </div>
          </div>
          <ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ocean-300" />
        </div>
        <div className="my-5 rounded-2xl border border-ocean-300/30 bg-ocean-900/50 p-4 sm:p-5">
          <p className="text-sm text-ocean-200">{es ? 'Total a pagar' : 'Amount due'}</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-white sm:text-4xl"><span className="mr-2 text-base font-medium text-ocean-200 sm:text-lg">{currency}</span>{amount}</p>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ocean-200">{es ? 'Aceptamos estas tarjetas' : 'We accept these cards'}</p>
          <img
            src="/footer/payment-cards.png"
            width={1100}
            height={120}
            alt="BAC Credomatic · American Express · Mastercard · Visa · Discover · JCB · Diners Club"
            className="block h-auto w-full"
          />
        </div>

        {state !== 'unavailable' ? (
          <div className={state === 'locked' ? 'pointer-events-none opacity-50' : undefined}>
            {/* Gateway-owned iframes are injected into these empty nodes; React must never render children here. */}
            <label className="flex items-center gap-2 text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.ccnumber}><CreditCard size={16} aria-hidden="true" />{es ? 'Número de tarjeta' : 'Card number'}</label>
            <div id={FIELD_IDS.ccnumber} className={`mt-2 ${fieldBox}`} />
            <div className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div className="min-w-0">
                <label className="flex items-center gap-2 text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.ccexp}><CalendarDays size={16} aria-hidden="true" />{es ? 'Vencimiento' : 'Expiration'}</label>
                <div id={FIELD_IDS.ccexp} className={`mt-2 ${fieldBox}`} />
              </div>
              <div className="min-w-0">
                <label className="flex items-center gap-2 text-sm font-semibold text-ocean-100" htmlFor={FIELD_IDS.cvv}><Lock size={16} aria-hidden="true" />CVV</label>
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
            <p className="mt-3 flex items-start justify-center gap-2 text-center text-xs leading-5 text-ocean-200"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />{es ? 'Tu banco puede solicitar una verificación adicional para autorizar el pago.' : 'Your bank may request additional verification to authorize your payment.'}</p>
            {busy ? <p className="mt-2 text-sm text-ocean-100" role="status">{es ? 'Mantén esta página abierta mientras verificamos el pago.' : 'Keep this page open while we verify your payment.'}</p> : null}
          </div>
        ) : null}

        {notice ? <p className="mt-3 text-xs text-ocean-200" role="status">{notice}</p> : null}
        {error ? (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
            <p className="font-bold">{state === 'locked'
              ? (es ? 'Pago pendiente de verificación' : 'Payment result needs verification')
              : fieldValidationError
                ? (es ? 'Revisa los datos de la tarjeta' : 'Check your card details')
                : (es ? 'No se pudo completar el pago' : 'Payment could not be completed')}</p>
            <p className="mt-1">{state === 'locked'
              ? (es ? 'Aún no podemos confirmar si se realizó el cobro. Este aviso no significa que tu tarjeta haya sido rechazada.' : 'We cannot yet confirm whether you were charged. This notice does not mean your card was declined.')
              : error}</p>
            {state === 'locked' ? (
              <>
                <p className="mt-2">{es ? 'Para evitar un cobro duplicado, no vuelvas a pagar ni uses otro método de pago. Contáctanos para verificar la operación con BAC.' : 'Do not pay again or use another payment method, to avoid a duplicate charge. Contact us so we can verify the transaction with BAC.'}</p>
                <p className="mt-2 font-semibold break-words">{es ? 'Referencia para consultar:' : 'Reference for your inquiry:'} {createdBooking.booking_reference}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
