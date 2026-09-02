import { CreditCard, Info, Mail, MapPin, MessageCircle, Phone, Ship, User, WalletCards } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getBoatText, getPackageLabel, getTourGroupKey, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { MOCK_TURNSTILE_TOKEN, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { capturePayPalOrder, createPayPalOrder, getPayPalErrorMessage, loadPayPalSdk, type PayPalCaptureResult } from '../../services/paypalService';
import { getBookingAvailability, type AvailabilitySlot } from '../../services/availabilityService';
import { calculateBookingPrice, createBooking, getActiveDepartureLocations, type BookingResult, type DepartureLocation, type PriceResult } from '../../services/bookingService';
import { getActivePaymentMethods } from '../../services/paymentService';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { buildBookingPaymentPayload, createWhatsAppBookingMessage, getWhatsAppBookingUrl, type BookingPaymentMethod, type BookingStatus, type BookingPaymentPayload, type PaymentStatus } from '../../utils/bookingPayment';
import { calculateBookingTotal, getBoatStartingPrice, getEffectiveMaxGuests, getExtraGuestPrice, getTourIncludedGuests } from '../../utils/bookingPricing';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/formatCurrency';
import { TurnstileBox } from '../common/TurnstileBox';
import { Badge, Button, ChoiceCard, Field, FieldError, GlassPanel, Input, ModalShell, TextArea } from '../ui';

interface BookingPanelProps {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  boats: Boat[];
  tours: BoatTour[];
  catalogLoading?: boolean;
  selectedTimeSlotId?: string;
  onBoatChange: (boat: Boat) => void;
  onTourChange: (tour?: BoatTour) => void;
}

const paymentMethods: Array<{ id: BookingPaymentMethod; title: string; description: string; icon: typeof CreditCard; logo?: string; logoAlt?: string }> = [
  { id: 'paypal', title: 'Pay with PayPal', description: 'Secure USD checkout.', icon: CreditCard, logo: '/images/paypal.png', logoAlt: 'PayPal' },
{ id: 'whatsapp-link', title: 'Request Payment Link via WhatsApp', description: 'Request a payment link.', icon: MessageCircle, logo: '/images/whatsapp.png', logoAlt: 'WhatsApp' },
  { id: 'pay-on-day', title: 'Pay on the Day of the Tour', description: 'Pay when the tour starts.', icon: WalletCards },
];

const fullDayMealOptions = [
  { en: 'Chicken wrap', es: 'Wrap de pollo' },
  { en: 'Ham and cheese wrap', es: 'Wrap de jamon y queso' },
  { en: 'Chicken sandwich', es: 'Sandwich de pollo' },
  { en: 'Ham and cheese sandwich', es: 'Sandwich de jamon y queso' },
  { en: 'Caprese sandwich', es: 'Sandwich caprese' },
  { en: 'Chicken salad', es: 'Ensalada de pollo' },
  { en: 'Ceviche', es: 'Ceviche' },
];

function getBookingTerms(language: 'es' | 'en') {
  return language === 'es'
    ? [
        'La solicitud queda sujeta a confirmacion de disponibilidad por el equipo.',
        'Metodos de pago: PayPal, enlace de pago por WhatsApp o pago el dia del tour.',
        'Cancelacion al menos 3 dias antes del tour: reembolso del 100% sin penalidad.',
        'Cancelacion dentro de 3 dias: penalidad del 30% por costos operativos y alquiler del bote. Reprogramar dentro de 3 dias es permitido segun disponibilidad.',
        'Cancelacion dentro de 24 horas: penalidad del 100% por costos operativos, alquiler del bote, comida y bebidas.',
        'Reembolso o reprogramacion por clima solo aplica por huracanes, pronostico de oleaje fuerte, vientos altos o lluvia fuerte dentro de 24 horas antes del tour. Dias nublados o poca luz solar no califican.',
      ]
    : [
        'The request remains subject to availability confirmation by the team.',
        'Payment methods: PayPal, WhatsApp payment link or pay on the day of the tour.',
        'Cancellation at least 3 days before the tour: 100% refund without penalty.',
        'Cancellation within 3 days: 30% penalty due to operational and boat rental costs. Rescheduling within 3 days is allowed for another available date, subject to availability.',
        'Cancellation within 24 hours: 100% penalty due to operational, boat rental, food and beverage costs.',
        'Refund or rescheduling for weather applies only to hurricanes, strong wave forecasts, high winds or heavy rain within 24 hours before the tour. Cloudy days or limited sunlight do not qualify.',
      ];
}

export function BookingPanel({ selectedBoat, selectedTour, boats, tours, catalogLoading, selectedTimeSlotId, onBoatChange, onTourChange }: BookingPanelProps) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [timeSlotId, setTimeSlotId] = useState(selectedTimeSlotId ?? selectedTour?.timeSlots[0]?.id ?? '');
  const [guests, setGuests] = useState(getTourIncludedGuests(selectedBoat, selectedTour));
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [mealOption, setMealOption] = useState('');
  const [departureLocationId, setDepartureLocationId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<BookingPaymentMethod>('paypal');
  const [isPayOnDayOpen, setIsPayOnDayOpen] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('pending');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [validationMessage, setValidationMessage] = useState('');
  const [paypalVisible, setPaypalVisible] = useState(false);
  const [paypalError, setPaypalError] = useState('');
  const [paypalSuccess, setPaypalSuccess] = useState<PayPalCaptureResult | null>(null);
  const [successNotice, setSuccessNotice] = useState<{ title: string; message: string; reference?: string } | null>(null);
  const [createdBooking, setCreatedBooking] = useState<BookingResult | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const availableTours = useMemo(() => tours.filter((tour) => tour.boatId === selectedBoat.id), [selectedBoat.id, tours]);
  const availabilityQuery = useQuery({
    queryKey: ['availability', selectedBoat.id, date],
    queryFn: () => getBookingAvailability(selectedBoat.id, date),
    enabled: Boolean(selectedBoat.id && date),
  });
  const paymentMethodsQuery = useQuery({ queryKey: ['paymentMethods', 'active'], queryFn: getActivePaymentMethods });
  const departureLocationsQuery = useQuery({ queryKey: ['departureLocations', 'active'], queryFn: getActiveDepartureLocations });
  const departureLocations = departureLocationsQuery.data ?? [];
  const selectedDepartureLocation = departureLocations.find((location) => location.id === departureLocationId);
  const remotePaymentMethods = paymentMethodsQuery.data?.map((method) => ({
    id: method.key as BookingPaymentMethod,
    title: method.name,
    description: method.description ?? '',
    icon: method.key === 'paypal' ? CreditCard : method.key === 'whatsapp-link' ? MessageCircle : WalletCards,
    logo: method.logo_url ?? undefined,
    logoAlt: method.name,
  }));
  const backendPaymentMethods = remotePaymentMethods?.length ? remotePaymentMethods : paymentMethods;
  const priceQuery = useQuery({
    queryKey: ['bookingPrice', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, guests, departureLocationId],
    queryFn: () => calculateBookingPrice({
      boatId: selectedBoat.id,
      tourId: selectedTour?.tourId ?? selectedTour?.category ?? '',
      boatTourId: selectedTour?.boatTourId,
      tourPackageId: selectedTour?.id ?? '',
      guests,
      departureLocationId: departureLocationId || undefined,
      extras: [],
    }),
    enabled: Boolean(selectedTour?.id && guests > 0),
    staleTime: 250,
  });
  const pricing = mapBackendPricing(selectedBoat, selectedTour, guests, selectedDepartureLocation, priceQuery.data);
  const effectiveMaxGuests = priceQuery.data?.max_guests ?? getEffectiveMaxGuests(selectedBoat, selectedTour);
  const includedGuests = priceQuery.data?.included_guests ?? getTourIncludedGuests(selectedBoat, selectedTour);
  const extraGuestPrice = priceQuery.data?.extra_guest_price ?? getExtraGuestPrice(selectedBoat, selectedTour);
  const currentSlots: Array<AvailabilitySlot | (BoatTour['timeSlots'][number] & { available?: boolean })> = availabilityQuery.data ?? selectedTour?.timeSlots ?? [];
  const selectedTimeSlot = currentSlots.find((slot) => slot.id === timeSlotId);
  const selectedPayment = backendPaymentMethods.find((method) => method.id === paymentMethod) ?? backendPaymentMethods[0];
  const steps = [tr(text.booking.steps.boat, language), tr(text.booking.steps.tour, language), language === 'es' ? 'Lugar de salida' : 'Departure location', language === 'es' ? 'Tus datos y pago' : 'Your details and payment'];
  const hasCapacityError = guests > effectiveMaxGuests;
  const canContinueToCustomer = Boolean(selectedTour && selectedTimeSlot && !hasCapacityError && !priceQuery.isError && !availabilityQuery.isError && selectedTimeSlot.available !== false);
  const hasTurnstileToken = USE_LOCAL_TURNSTILE_MOCK || Boolean(turnstileToken);
  const canContinueToPayment = Boolean(canContinueToCustomer && selectedDepartureLocation);
  const canReview = Boolean(canContinueToPayment && customerName.trim() && customerEmail.trim() && customerWhatsapp.trim() && isValidEmail(customerEmail) && hasTurnstileToken);
const bookingPayload = selectedTour
    ? buildBookingPaymentPayload({
        bookingReference: createdBooking?.booking_reference ?? 'Pending',
        customerName,
        phone: customerWhatsapp,
        email: customerEmail,
        boat: selectedBoat,
        tour: selectedTour,
        timeSlot: selectedTimeSlot,
        date,
        guests,
        pricing,
        departureLocation: selectedDepartureLocation,
        extras: priceQuery.data?.extras,
        specialRequests,
      })
    : null;

  useEffect(() => {
    const slots: Array<AvailabilitySlot | (BoatTour['timeSlots'][number] & { available?: boolean })> = availabilityQuery.data ?? selectedTour?.timeSlots ?? [];
    if (selectedTour && slots.length && !slots.some((slot) => slot.id === timeSlotId && slot.available !== false)) {
      setTimeSlotId(slots.find((slot) => slot.available !== false)?.id ?? '');
    }
  }, [availabilityQuery.data, selectedTour, timeSlotId]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [activeStep]);

  useEffect(() => {
    if (departureLocationId || !departureLocations.length) return;
    const defaultLocation = departureLocations.find((location) => location.is_default) ?? departureLocations[0];
    setDepartureLocationId(defaultLocation.id);
  }, [departureLocationId, departureLocations]);

  function handleBoatChange(boatId: string) {
    const nextBoat = boats.find((boat) => boat.id === boatId);
    if (!nextBoat) return;
    onBoatChange(nextBoat);
    onTourChange(undefined);
    setTimeSlotId('');
    setGuests(getTourIncludedGuests(nextBoat, undefined));
    setBookingStatus('pending');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    setPaypalSuccess(null);
    setCreatedBooking(null);
  }

  function handleTourChange(tourId: string) {
    const nextTour = availableTours.find((tour) => tour.id === tourId);
    onTourChange(nextTour);
    setTimeSlotId(nextTour?.timeSlots[0]?.id ?? '');
    if (nextTour) setGuests(getTourIncludedGuests(selectedBoat, nextTour));
    if (!nextTour || !isFullDayTour(nextTour)) setMealOption('');
    setBookingStatus('pending');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    setPaypalSuccess(null);
    setCreatedBooking(null);
  }

  function canVisitStep(stepIndex: number) {
    if (stepIndex <= activeStep) return true;
    if (stepIndex === 1) return true;
    if (stepIndex === 2) return canContinueToCustomer;
    return canContinueToPayment;
  }

  function goToStep(stepIndex: number) {
    if (!canVisitStep(stepIndex)) return;
    setActiveStep(stepIndex);
  }

  function validateBookingForPayment() {
    setValidationMessage('');
    if (!selectedTour) {
      setActiveStep(1);
      setValidationMessage('Please select a tour.');
      return null;
    }
    if (!selectedTimeSlot) {
      setActiveStep(1);
      setValidationMessage('Please select a departure time.');
      return null;
    }
    if (!date) {
      setActiveStep(1);
      setValidationMessage('Please select a date.');
      return null;
    }
    if (guests < 1 || guests > effectiveMaxGuests) {
      setActiveStep(1);
      setValidationMessage(`Please select between 1 and ${effectiveMaxGuests} guests.`);
      return null;
    }
    if (!selectedDepartureLocation) {
      setActiveStep(2);
      setValidationMessage('Please select a departure location.');
      return null;
    }
    if (!customerName.trim()) {
      setActiveStep(3);
      setValidationMessage('Please enter the customer name.');
      return null;
    }
    if (!customerWhatsapp.trim()) {
      setActiveStep(3);
      setValidationMessage('Please enter the phone number.');
      return null;
    }
    if (!isValidEmail(customerEmail)) {
      setActiveStep(3);
      setValidationMessage('Please enter a valid email.');
      return null;
    }
    if (pricing.isCustomQuote || pricing.total <= 0 || !bookingPayload) {
      setActiveStep(1);
      setValidationMessage('Please select a priced tour package.');
      return null;
    }
    return bookingPayload;
  }

  const createBookingMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: (booking) => {
      setCreatedBooking(booking);
      queryClient.invalidateQueries({ queryKey: ['availability', selectedBoat.id, date] });
    },
    onError: (error: Error & { status?: number }) => {
      setTurnstileToken('');
      setTurnstileResetKey((value) => value + 1);
      if (error.status === 409) {
        setValidationMessage('This time slot is no longer available. Please select another time.');
        queryClient.invalidateQueries({ queryKey: ['availability', selectedBoat.id, date] });
        setActiveStep(1);
        return;
      }
      setValidationMessage(error.message || 'We couldn’t create the booking. Please try again.');
    },
  });

  async function submitBooking(method: BookingPaymentMethod) {
    const booking = validateBookingForPayment();
    if (!booking || !selectedTour || !selectedTimeSlot) return null;
    const result = await createBookingMutation.mutateAsync({
      customer: { fullName: customerName, email: customerEmail, whatsapp: customerWhatsapp },
      boatId: selectedBoat.id,
      tourId: selectedTour.tourId ?? selectedTour.category,
      tourPackageId: selectedTour.id,
      tourDate: date,
      timeSlotId,
      guests,
      departureLocationId,
      mealOption: mealOption || undefined,
      specialRequests: specialRequests || undefined,
      paymentMethodKey: method,
      extras: [],
      turnstileToken: USE_LOCAL_TURNSTILE_MOCK ? MOCK_TURNSTILE_TOKEN : turnstileToken,
    });
    setTurnstileToken('');
    setTurnstileResetKey((value) => value + 1);
    return result;
  }

  function openWhatsAppBooking(booking: BookingPaymentPayload, variant: 'payment_link' | 'pay_on_day' | 'paid_confirmation') {
    window.open(getWhatsAppBookingUrl(createWhatsAppBookingMessage(booking, variant)), '_blank', 'noopener,noreferrer');
  }

  function handlePaymentLinkRequest() {
    submitBooking('whatsapp-link').then((result) => {
      if (!result || !bookingPayload) return;
      setPaymentMethod('whatsapp-link');
      setBookingStatus('pending_confirmation');
      setPaymentStatus('pending');
      setPaypalVisible(false);
      setSuccessNotice(null);
      openWhatsAppBooking({ ...bookingPayload, bookingReference: result.booking_reference, total: result.total_snapshot }, 'payment_link');
      setSuccessNotice({
        title: language === 'es' ? 'Reserva creada' : 'Booking created',
        message: language === 'es' ? 'Recibimos tu reserva. Abre WhatsApp para solicitar el enlace de pago.' : 'We received your booking. Open WhatsApp to request the payment link.',
        reference: result.booking_reference,
      });
    }).catch(() => undefined);
  }

  function handlePayOnDayRequest() {
    const booking = validateBookingForPayment();
    if (!booking) return;
    setPaymentMethod('pay-on-day');
    setIsPayOnDayOpen(true);
  }

  function handleConfirmPayOnDay() {
    const booking = validateBookingForPayment();
    if (!booking) return;
    submitBooking('pay-on-day').then((result) => {
      if (!result || !bookingPayload) return;
      setBookingStatus('pending_confirmation');
      setPaymentStatus('not_required_yet');
      setIsPayOnDayOpen(false);
      openWhatsAppBooking({ ...bookingPayload, bookingReference: result.booking_reference, total: result.total_snapshot }, 'pay_on_day');
      setSuccessNotice({
        title: language === 'es' ? 'Reserva recibida' : 'Booking received',
        message: language === 'es' ? 'Tu solicitud fue creada y queda pendiente de confirmacion.' : 'Your request was created and is pending confirmation.',
        reference: result.booking_reference,
      });
    }).catch(() => undefined);
  }

  function handlePayPalRequest() {
    const booking = validateBookingForPayment();
    if (!booking) return;
    submitBooking('paypal').then(() => {
      setPaymentMethod('paypal');
      setBookingStatus('pending_payment');
      setPaymentStatus('pending');
      setPaypalError('');
      setPaypalVisible(true);
    }).catch(() => undefined);
  }

  return (
    <GlassPanel className="relative -mx-4 overflow-hidden !rounded-none p-3 text-white sm:mx-0 sm:!rounded-[var(--radius-panel)] sm:p-4 lg:p-5" variant="panel">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(110,172,201,0.10),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(73,134,167,0.10),transparent_20rem)]" />
      <div className="relative mx-auto max-w-xl text-center">
        <Badge className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] sm:text-[0.66rem]" variant="subtle">{tr(text.booking.badge, language)}</Badge>
        <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-extrabold leading-tight text-white outline-none min-[420px]:text-[1.75rem] sm:text-[1.9rem]">{tr(text.booking.title, language)}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs font-medium leading-5 text-ocean-200/90 sm:text-sm">{tr(text.booking.subtitle, language)}</p>
      </div>

      <GlassPanel className="relative mx-auto mt-4 grid max-w-lg grid-cols-4 items-start gap-1 px-2 py-2 sm:mt-5 sm:gap-2" variant="subtle">
        {steps.map((step, index) => (
          <button
            key={step}
            className={cn(
              'glass-focus-ring group relative grid min-w-0 justify-items-center gap-1.5 rounded-xl px-1 py-1 text-center transition-colors duration-200 sm:px-2',
              index < steps.length - 1 && 'after:absolute after:left-[calc(50%+1.15rem)] after:top-3.5 after:h-px after:w-[calc(100%-2.3rem)]',
              index < activeStep ? 'after:bg-[var(--glass-accent-border)]' : 'after:bg-[var(--surface-border)]',
            )}
            type="button"
            aria-current={activeStep === index ? 'step' : undefined}
            aria-disabled={!canVisitStep(index)}
            onClick={() => goToStep(index)}
          >
            <GlassPanel as="span" className={cn('grid h-6 w-6 place-items-center text-[0.68rem] font-extrabold transition-[background-color,border-color,color,box-shadow] duration-200 sm:h-7 sm:w-7 sm:text-xs', activeStep === index ? 'glass-selected text-white' : activeStep > index ? 'glass-accent text-ocean-100' : 'text-ocean-300')} shape="circle" variant="control">
              {index + 1}
            </GlassPanel>
            <span className={cn('max-w-full text-[0.6rem] font-bold leading-tight sm:text-[0.66rem]', activeStep === index ? 'text-ocean-200' : 'text-ocean-500')}>{step}</span>
          </button>
        ))}
      </GlassPanel>

      <div className="relative mt-4 grid gap-3 xl:mt-5 xl:grid-cols-[minmax(0,1fr)_290px] xl:gap-4">
        <GlassPanel className="p-3 min-[420px]:p-4" variant="surface">
          {activeStep === 0 ? (
            <BoatStep boats={boats} tours={tours} selectedBoat={selectedBoat} catalogLoading={catalogLoading} onBoatChange={handleBoatChange} onNext={() => setActiveStep(1)} />
          ) : null}

          {activeStep === 1 ? (
            <TourDetailsStep
              selectedBoat={selectedBoat}
              selectedTour={selectedTour}
              availableTours={availableTours}
              date={date}
              guests={guests}
              timeSlotId={timeSlotId}
              includedGuests={includedGuests}
              effectiveMaxGuests={effectiveMaxGuests}
              extraGuestPrice={extraGuestPrice}
              pricing={pricing}
              priceLoading={priceQuery.isFetching}
              priceError={priceQuery.isError}
              availabilitySlots={availabilityQuery.data ?? []}
              availabilityLoading={availabilityQuery.isFetching}
              availabilityError={availabilityQuery.isError}
              mealOption={mealOption}
              hasCapacityError={hasCapacityError}
              canContinue={canContinueToCustomer}
              onTourChange={handleTourChange}
              onDateChange={setDate}
              onGuestsChange={setGuests}
              onMealOptionChange={setMealOption}
              onTimeSlotChange={setTimeSlotId}
              onBack={() => setActiveStep(0)}
              onNext={() => setActiveStep(2)}
            />
          ) : null}

          {activeStep === 2 ? (
            <DepartureLocationStep
              locations={departureLocations}
              selectedLocationId={departureLocationId}
              loading={departureLocationsQuery.isFetching}
              error={departureLocationsQuery.isError}
              onLocationChange={setDepartureLocationId}
              onBack={() => setActiveStep(1)}
              onNext={() => {
                if (!departureLocationId) {
                  setValidationMessage('Please select a departure location.');
                  return;
                }
                setValidationMessage('');
                setActiveStep(3);
              }}
            />
          ) : null}

          {activeStep === 3 ? (
            <CustomerStep
              customerName={customerName}
              customerEmail={customerEmail}
              customerWhatsapp={customerWhatsapp}
              specialRequests={specialRequests}
              paymentMethod={paymentMethod}
              paymentMethods={backendPaymentMethods}
              bookingStatus={bookingStatus}
              paymentStatus={paymentStatus}
              canReview={canReview}
              validationMessage={validationMessage}
              isSubmitting={createBookingMutation.isPending}
              booking={bookingPayload}
              createdBooking={createdBooking}
              turnstileToken={turnstileToken}
              turnstileResetKey={turnstileResetKey}
              onTurnstileTokenChange={setTurnstileToken}
              paypalVisible={paypalVisible}
              paypalError={paypalError}
              paypalSuccess={paypalSuccess}
              onCustomerNameChange={setCustomerName}
              onCustomerEmailChange={setCustomerEmail}
              onCustomerWhatsappChange={setCustomerWhatsapp}
              onSpecialRequestsChange={setSpecialRequests}
              onPaymentMethodChange={setPaymentMethod}
              onPayPalRequest={handlePayPalRequest}
              onPaymentLinkRequest={handlePaymentLinkRequest}
              onPayOnDayRequest={handlePayOnDayRequest}
              onPayPalSuccess={(result) => {
                setPaypalSuccess(result);
                if (result.paymentStatus === 'paid') {
                  setBookingStatus('confirmed');
                  setPaymentStatus('paid');
                }
                setSuccessNotice({
                  title: language === 'es' ? 'Pago completado' : 'Payment completed',
                  message: language === 'es' ? 'Tu pago fue procesado y recibimos tu reserva.' : 'Your payment was processed and we received your booking.',
                  reference: result.bookingReference,
                });
              }}
              onPayPalError={(message) => {
                setPaypalError(message);
                setBookingStatus('pending_payment');
                setPaymentStatus('failed');
              }}
              onPayPalCancel={() => {
                setPaypalError('Payment was cancelled. You can try again or select another payment method.');
                setBookingStatus('pending_payment');
                setPaymentStatus('failed');
              }}
              onSendPaidConfirmation={() => {
                const booking = validateBookingForPayment();
                if (booking) openWhatsAppBooking(booking, 'paid_confirmation');
              }}
              onBack={() => setActiveStep(2)}
            />
          ) : null}
        </GlassPanel>

        <div className="xl:hidden">
          <BookingProgressSummary
            selectedBoat={selectedBoat}
            selectedTour={selectedTour}
            date={date}
            selectedTimeSlot={selectedTimeSlot}
            guests={guests}
            mealOption={mealOption}
            pricing={pricing}
            departureLocation={selectedDepartureLocation}
            activeStep={activeStep}
          />
        </div>

        <div className="hidden xl:block">
          <BookingSummary
            selectedBoat={selectedBoat}
            selectedTour={selectedTour}
            date={date}
            selectedTimeSlot={selectedTimeSlot}
            guests={guests}
            selectedPayment={selectedPayment.title}
            paymentStatus={paymentStatus}
            mealOption={mealOption}
            pricing={pricing}
            departureLocation={selectedDepartureLocation}
          />
        </div>
      </div>

      {isPayOnDayOpen && bookingPayload ? (
        <ReviewModal
          selectedBoat={selectedBoat}
          selectedTour={selectedTour}
          date={date}
          departure={selectedTimeSlot?.time ?? 'Not selected'}
          guests={guests}
          mealOption={mealOption}
          customerName={customerName}
          customerEmail={customerEmail}
          customerWhatsapp={customerWhatsapp}
          specialRequests={specialRequests}
          paymentMethod="Pay on the Day of the Tour"
          pricing={pricing}
          departureLocation={selectedDepartureLocation}
          onBack={() => setIsPayOnDayOpen(false)}
          onConfirm={handleConfirmPayOnDay}
        />
      ) : null}

      {successNotice ? (
        <BookingSuccessModal notice={successNotice} onClose={() => setSuccessNotice(null)} />
      ) : null}
    </GlassPanel>
  );
}

function BoatStep(props: { boats: Boat[]; tours: BoatTour[]; selectedBoat: Boat; catalogLoading?: boolean; onBoatChange: (boatId: string) => void; onNext: () => void }) {
  const { language } = useLanguage();

  return (
    <div>
      <div className="flex items-center gap-3 text-white">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean-500/15 text-ocean-300 sm:h-10 sm:w-10"><Ship size={19} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.privateFleet, language)}</p>
          <h3 className="text-lg font-extrabold text-white sm:text-xl">{tr(text.booking.chooseBoat, language)}</h3>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:mt-6 sm:gap-3">
        {props.catalogLoading ? <p className="text-sm font-semibold text-ocean-200">Loading boats...</p> : null}
        {props.boats.map((boat) => (
          <ChoiceCard
            key={boat.id}
            className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3 p-2.5 text-left sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-3 sm:p-2.5"
            selected={props.selectedBoat.id === boat.id}
            onClick={() => props.onBoatChange(boat.id)}
          >
            <img src={boat.image} alt={boat.name} className="h-12 w-12 rounded-xl object-cover sm:h-14 sm:w-14" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-white sm:text-base">{boat.name}</span>
              <span className="mt-1 block text-xs font-semibold text-ocean-200">{boat.length}</span>
              <span className="mt-1 block text-xs font-medium text-ocean-400">{boat.featuredSpec}</span>
            </span>
            <span className="col-span-2 text-sm font-extrabold text-ocean-400 sm:col-span-1 sm:text-right">{formatCurrency(getBoatStartingPrice(boat.id, props.tours))}</span>
          </ChoiceCard>
        ))}
      </div>
      <div className="mt-4 sm:mt-5">
        <Button fullWidth type="button" onClick={props.onNext}>
          {tr(text.booking.continue, language)}
        </Button>
      </div>
    </div>
  );
}

function TourDetailsStep(props: {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  availableTours: BoatTour[];
  date: string;
  guests: number;
  timeSlotId: string;
  includedGuests: number;
  effectiveMaxGuests: number;
  extraGuestPrice: number;
  pricing: ReturnType<typeof calculateBookingTotal>;
  priceLoading: boolean;
  priceError: boolean;
  availabilitySlots: Array<{ id: string; label: string; time: string; available?: boolean }>;
  availabilityLoading: boolean;
  availabilityError: boolean;
  mealOption: string;
  hasCapacityError: boolean;
  canContinue: boolean;
  onTourChange: (tourId: string) => void;
  onDateChange: (date: string) => void;
  onGuestsChange: (guests: number) => void;
  onMealOptionChange: (meal: string) => void;
  onTimeSlotChange: (slotId: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { language } = useLanguage();
  const tourGroups = getBookingTourGroups(props.availableTours, language);
  const activeGroup = props.selectedTour ? getTourGroupKey(props.selectedTour) : '';
  const activeGroupData = tourGroups.find((group) => group.key === activeGroup);

  return (
    <div className="grid gap-4 text-white sm:gap-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.tourDetails, language)}</p>
        <h3 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">{tr(text.booking.buildReservation, language)}</h3>
      </div>
      <fieldset>
        <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.tourAboard, language)} {props.selectedBoat.name}</legend>
        <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
          {tourGroups.map((group) => (
            <ChoiceCard
              key={group.key}
              className="p-2.5 text-left sm:p-3"
              selected={activeGroup === group.key}
              onClick={() => props.onTourChange(group.tours[0].id)}
            >
              <span className="block truncate text-sm font-extrabold text-white">{group.label}</span>
              <span className="mt-1 block text-xs font-bold text-ocean-400">From {formatCurrency(group.tours[0].basePrice)}</span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>

      {activeGroupData ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Escoge paquete o duracion' : 'Choose package or duration'}</legend>
          <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2 min-[640px]:grid-cols-3">
            {activeGroupData.tours.map((tour) => (
              <ChoiceCard as="label" key={tour.id} className="cursor-pointer p-2.5 sm:p-3" selected={props.selectedTour?.id === tour.id}>
                <input className="sr-only" type="radio" name="tourPackage" value={tour.id} checked={props.selectedTour?.id === tour.id} onChange={() => props.onTourChange(tour.id)} />
                <span className="block truncate text-xs font-extrabold text-white">{getPackageLabel(tour, language)}</span>
                <span className="mt-1 block text-lg font-extrabold text-ocean-400">{formatCurrency(tour.basePrice)}</span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      ) : null}

      {isFullDayTour(props.selectedTour) ? (
        <GlassPanel as="fieldset" className="p-3 sm:p-4" variant="subtle">
          <legend className="px-1 text-sm font-bold text-ocean-100">{language === 'es' ? 'Comida opcional para Dia completo' : 'Optional meal for Full Day'}</legend>
          <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
            {fullDayMealOptions.map((meal) => (
            <ChoiceCard as="label" key={meal.en} className="cursor-pointer p-2.5 text-xs font-bold leading-5 text-ocean-100 sm:p-3 sm:text-sm" selected={props.mealOption === meal[language]}>
                <input className="sr-only" type="radio" name="mealOption" value={meal[language]} checked={props.mealOption === meal[language]} onChange={() => props.onMealOptionChange(meal[language])} />
                {meal[language]}
              </ChoiceCard>
            ))}
          </div>
          <button className="glass-focus-ring mt-3 rounded-sm text-xs font-bold text-ocean-400 underline-offset-4 hover:underline" type="button" onClick={() => props.onMealOptionChange('')}>
            {language === 'es' ? 'Sin comida seleccionada' : 'No meal selected'}
          </button>
        </GlassPanel>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="booking-date" label={tr(text.booking.date, language)} labelClassName="text-sm font-bold">
          <Input id="booking-date" className="sm:px-4" tone="ocean" type="date" value={props.date} onChange={(event) => props.onDateChange(event.target.value)} />
        </Field>
        <Field error={props.hasCapacityError ? (language === 'es' ? `Este barco tiene capacidad maxima de ${props.effectiveMaxGuests} personas.` : `This boat has a maximum capacity of ${props.effectiveMaxGuests} guests.`) : undefined} errorId="booking-guests-error" htmlFor="booking-guests" label={tr(text.booking.guests, language)} labelClassName="text-sm font-bold">
          <Input id="booking-guests" aria-describedby={props.hasCapacityError ? 'booking-guests-error' : undefined} aria-invalid={props.hasCapacityError} className="sm:px-4" inputMode="numeric" max={props.effectiveMaxGuests} min={1} tone="ocean" type="number" value={props.guests} onChange={(event) => props.onGuestsChange(clampGuests(Number(event.target.value), props.effectiveMaxGuests))} />
        </Field>
      </div>

      {props.selectedTour ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.departure, language)}</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
            {(props.availabilitySlots.length ? props.availabilitySlots : props.selectedTour.timeSlots.map((slot) => ({ ...slot, available: true }))).map((slot) => (
              <ChoiceCard as="label" key={slot.id} className="cursor-pointer p-3 text-center" disabled={slot.available === false} selected={props.timeSlotId === slot.id}>
                <input className="sr-only" type="radio" name="timeSlot" value={slot.id} checked={props.timeSlotId === slot.id} disabled={slot.available === false} onChange={() => props.onTimeSlotChange(slot.id)} />
                <span className="block truncate text-xs font-extrabold text-white">{slot.label}</span>
                <span className="mt-1 block text-base font-extrabold text-ocean-600 sm:text-lg">{slot.time}</span>
                {slot.available === false ? <span className="mt-1 block text-[0.65rem] font-bold text-red-200">Unavailable</span> : null}
              </ChoiceCard>
            ))}
          </div>
          {props.availabilityLoading ? <p className="mt-2 text-xs font-semibold text-ocean-300">Checking availability...</p> : null}
          {props.availabilityError ? <p className="mt-2 text-xs font-semibold text-red-200">We couldn’t load the booking information. Please try again.</p> : null}
        </fieldset>
      ) : null}

      <GlassPanel className="p-3 text-sm text-ocean-100 sm:p-4" variant="subtle">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Price</p>
        {props.priceLoading ? <p className="mt-2 font-semibold">Calculating...</p> : null}
        {props.priceError ? <p className="mt-2 font-semibold text-red-200">We couldn’t load the booking information. Please try again.</p> : null}
        {!props.priceLoading && !props.priceError ? (
          <div className="mt-2 grid gap-1.5">
            {props.pricing.isCustomQuote ? (
              <p className="font-extrabold text-ocean-300">Custom quote required</p>
            ) : (
              <>
                <SummaryLine label={language === 'es' ? 'Precio base del bote' : 'Boat base price'} value={formatCurrency(props.pricing.basePrice)} />
                <SummaryLine label={language === 'es' ? 'Incluye hasta' : 'Includes up to'} value={`${props.includedGuests} ${language === 'es' ? 'personas' : 'guests'}`} />
                <SummaryLine label="Additional guests" value={`${props.pricing.extraGuests} x ${formatCurrency(props.extraGuestPrice)}`} />
                <SummaryLine label="Additional guest charge" value={formatCurrency(props.pricing.extraGuestsTotal)} />
                <SummaryLine label="Extras" value={formatCurrency(props.pricing.extrasTotal ?? 0)} />
                <SummaryLine label="Total" value={formatCurrency(props.pricing.total)} />
              </>
            )}
          </div>
        ) : null}
      </GlassPanel>

      {props.selectedTour && props.guests > props.includedGuests && !props.hasCapacityError ? (
        <div className="rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-3 text-ocean-100 sm:p-4">
          <p className="flex items-start gap-2 text-sm font-bold sm:text-base"><Info size={18} className="mt-0.5 shrink-0 text-ocean-600" /> {language === 'es' ? `Tu tour incluye ${props.includedGuests} personas.` : `Your tour includes ${props.includedGuests} guests.`}</p>
          <p className="mt-2 text-sm">{language === 'es' ? `${props.pricing.extraGuests} personas extra x ${formatCurrency(props.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : `${props.pricing.extraGuests} additional guests x ${formatCurrency(props.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}`}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
        <Button type="button" variant="glass" onClick={props.onBack}>
          {tr(text.booking.back, language)}
        </Button>
        <Button type="button" disabled={!props.canContinue} onClick={props.onNext}>
          {tr(text.booking.continueData, language)}
        </Button>
      </div>
    </div>
  );
}

function getBookingTourGroups(tours: BoatTour[], language: 'es' | 'en') {
  const groups = new Map<string, BoatTour[]>();

  tours.forEach((tour) => {
    const key = getTourGroupKey(tour);
    groups.set(key, [...(groups.get(key) ?? []), tour]);
  });

  return Array.from(groups.entries()).map(([key, groupTours]) => ({
    key,
    tours: [...groupTours].sort((a, b) => a.basePrice - b.basePrice),
  })).map((group) => ({
    ...group,
    label: String(getTourText(group.tours[0], language).title),
  }));
}

function mapBackendPricing(boat: Boat, tour: BoatTour | undefined, guests: number, departureLocation?: DepartureLocation, price?: PriceResult): ReturnType<typeof calculateBookingTotal> {
  const fallbackDepartureSurcharge = Number(departureLocation?.surcharge_amount ?? 0);
  if (!price) return calculateBookingTotal(boat, tour, guests, fallbackDepartureSurcharge);
  if (price.custom_quote) {
    return {
      isCustomQuote: true,
      basePrice: 0,
      includedGuests: Number(price.included_guests ?? getTourIncludedGuests(boat, tour)),
      extraGuests: 0,
      extraGuestPrice: Number(price.extra_guest_price ?? getExtraGuestPrice(boat, tour)),
      extraGuestsTotal: 0,
      extrasTotal: 0,
      departureSurcharge: fallbackDepartureSurcharge,
      total: 0,
    };
  }
  return {
    isCustomQuote: false,
    basePrice: Number(price.base_price ?? 0),
    includedGuests: Number(price.included_guests ?? getTourIncludedGuests(boat, tour)),
    extraGuests: Number(price.extra_guests ?? 0),
    extraGuestPrice: Number(price.extra_guest_price ?? 0),
    extraGuestsTotal: Number(price.extra_guests_total ?? 0),
    extrasTotal: Number(price.extras_total ?? 0),
    departureSurcharge: Number(price.departure_surcharge ?? fallbackDepartureSurcharge),
    total: Number(price.total ?? 0),
  };
}

function DepartureLocationStep(props: {
  locations: DepartureLocation[];
  selectedLocationId: string;
  loading: boolean;
  error: boolean;
  onLocationChange: (locationId: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const selected = Boolean(props.selectedLocationId);
  return (
    <div className="grid gap-4 text-white sm:gap-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean-500/15 text-ocean-300 sm:h-10 sm:w-10"><MapPin size={19} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">Lugar de salida</p>
          <h3 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">Selecciona el lugar de salida</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ocean-200">Elige el punto desde donde deseas iniciar el tour. Algunas ubicaciones tienen un cargo adicional por desplazamiento.</p>
        </div>
      </div>

      <fieldset aria-describedby={!selected ? 'departure-location-error' : undefined}>
        <legend className="sr-only">Selecciona el lugar de salida</legend>
        {props.loading ? <p className="rounded-xl border border-ocean-400/25 bg-ocean-500/10 p-3 text-sm font-semibold text-ocean-100">Cargando lugares de salida...</p> : null}
        {props.error ? <p className="rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100">No pudimos cargar los lugares de salida. Intenta de nuevo.</p> : null}
        {!props.loading && !props.error && props.locations.length === 0 ? (
          <p className="rounded-xl border border-ocean-400/25 bg-ocean-500/10 p-3 text-sm font-semibold text-ocean-100">No hay lugares de salida disponibles.</p>
        ) : null}
        <div className="grid gap-2 min-[520px]:grid-cols-2">
          {props.locations.map((location) => (
            <ChoiceCard as="label" key={location.id} className="cursor-pointer p-3 text-left sm:p-4" selected={props.selectedLocationId === location.id} onClick={() => props.onLocationChange(location.id)}>
              <input className="sr-only" type="radio" name="departureLocation" value={location.id} checked={props.selectedLocationId === location.id} onChange={() => props.onLocationChange(location.id)} />
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-white">{location.name}</span>
                  {location.description ? <span className="mt-1 block text-xs leading-5 text-ocean-200">{location.description}</span> : null}
                </span>
                <span className="shrink-0 rounded-full border border-ocean-300/25 bg-ocean-500/10 px-2.5 py-1 text-xs font-extrabold text-ocean-100">
                  {Number(location.surcharge_amount) > 0 ? `+ USD ${Number(location.surcharge_amount)}` : 'Sin costo adicional'}
                </span>
              </span>
              <span className="mt-3 block text-xs font-bold text-ocean-300">{props.selectedLocationId === location.id ? 'Seleccionado' : 'Seleccionar'}</span>
            </ChoiceCard>
          ))}
        </div>
        {!selected ? <FieldError id="departure-location-error">Selecciona un lugar de salida para continuar.</FieldError> : null}
      </fieldset>

      <div className="mt-auto flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
        <Button type="button" variant="glass" onClick={props.onBack}>Atrás</Button>
        <Button type="button" disabled={!selected || props.loading || props.error || props.locations.length === 0} onClick={props.onNext}>Continuar</Button>
      </div>
    </div>
  );
}

function isFullDayTour(tour?: BoatTour) {
  return Boolean(tour?.name.toLowerCase().includes('full day'));
}

function clampGuests(value: number, maxGuests: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), maxGuests);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function CustomerStep(props: {
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  specialRequests: string;
  paymentMethod: BookingPaymentMethod;
  paymentMethods: typeof paymentMethods;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  canReview: boolean;
  validationMessage: string;
  isSubmitting: boolean;
  booking: BookingPaymentPayload | null;
  createdBooking: BookingResult | null;
  turnstileToken: string;
  turnstileResetKey: number;
  paypalVisible: boolean;
  paypalError: string;
  paypalSuccess: PayPalCaptureResult | null;
  onCustomerNameChange: (name: string) => void;
  onCustomerEmailChange: (email: string) => void;
  onCustomerWhatsappChange: (value: string) => void;
  onSpecialRequestsChange: (value: string) => void;
  onTurnstileTokenChange: (token: string) => void;
  onPaymentMethodChange: (method: BookingPaymentMethod) => void;
  onPayPalRequest: () => void;
  onPaymentLinkRequest: () => void;
  onPayOnDayRequest: () => void;
  onPayPalSuccess: (result: PayPalCaptureResult) => void;
  onPayPalError: (message: string) => void;
  onPayPalCancel: () => void;
  onSendPaidConfirmation: () => void;
  onBack: () => void;
}) {
  const { language } = useLanguage();

  function handlePaymentMethodAction(method: BookingPaymentMethod) {
    if (props.isSubmitting) return;
    props.onPaymentMethodChange(method);
    if (method === 'paypal') props.onPayPalRequest();
    if (method === 'whatsapp-link') props.onPaymentLinkRequest();
    if (method === 'pay-on-day') props.onPayOnDayRequest();
  }

  return (
    <div className="flex flex-col text-white">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.yourData, language)}</p>
        <h3 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">{tr(text.booking.basicInfo, language)}</h3>
      </div>

      <div className="mt-5 grid gap-4 sm:mt-6">
        <Field htmlFor="booking-name" label={tr(text.booking.fullName, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-name" autoComplete="name" placeholder="John Smith" startIcon={<User size={17} />} value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} />
        </Field>

        <Field htmlFor="booking-email" label={tr(text.booking.email, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-email" autoComplete="email" placeholder="john@email.com" spellCheck={false} startIcon={<Mail size={17} />} type="email" value={props.customerEmail} onChange={(event) => props.onCustomerEmailChange(event.target.value)} />
        </Field>

        <Field htmlFor="booking-phone" label={tr(text.booking.phone, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-phone" autoComplete="tel" inputMode="tel" placeholder="+506 0000 0000" startIcon={<Phone size={17} />} type="tel" value={props.customerWhatsapp} onChange={(event) => props.onCustomerWhatsappChange(event.target.value)} />
        </Field>

        <Field htmlFor="booking-requests" label="Special requests" labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <TextArea id="booking-requests" className="min-h-[5.5rem]" placeholder="Optional meal notes, celebration details, accessibility needs..." shape="rounded" value={props.specialRequests} onChange={(event) => props.onSpecialRequestsChange(event.target.value)} />
        </Field>
      </div>

      <div className="mt-5">
        <BookingPaymentSummary booking={props.booking} />
      </div>

      {props.validationMessage ? <FieldError className="mt-4" variant="panel">{props.validationMessage}</FieldError> : null}

<TurnstileBox
        className="mt-5"
        resetKey={props.turnstileResetKey}
        token={props.turnstileToken}
        onTokenChange={props.onTurnstileTokenChange}
      />

      <GlassPanel as="fieldset" className="mt-5 p-3 sm:p-4" variant="subtle">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Payment method</legend>
          <span className="text-xs font-semibold text-ocean-300">Choose one option to continue</span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {props.paymentMethods.map((method, index) => (
            <ChoiceCard
              key={method.id}
              data-payment-method={method.id}
              className="group flex items-center gap-2.5 p-2.5 text-left hover:-translate-y-0.5 sm:p-3 lg:min-h-[5.25rem]"
              disabled={props.isSubmitting}
              selected={props.paymentMethod === method.id}
              onClick={() => handlePaymentMethodAction(method.id)}
            >
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.08] text-ocean-300 transition-transform duration-200 group-hover:scale-[1.03]', method.logo && 'bg-white')}>
                {method.logo ? (
                  <img className="h-6 w-6 object-contain" src={method.logo} alt={method.logoAlt ?? method.title} loading="lazy" />
                ) : (
                  <method.icon size={15} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.82rem] font-extrabold leading-tight text-white sm:text-sm">{method.title}</span>
                <span className="mt-0.5 block text-[0.72rem] leading-4 text-ocean-200">{method.description}</span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      </GlassPanel>

      {props.paypalVisible && props.booking && props.createdBooking ? (
        <PayPalCheckoutBox booking={props.booking} createdBooking={props.createdBooking} onSuccess={props.onPayPalSuccess} onError={props.onPayPalError} onCancel={props.onPayPalCancel} />
      ) : null}

      {props.paypalError ? (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-bold">Payment could not be completed</p>
          <p className="mt-1">{props.paypalError}</p>
        </div>
      ) : null}

      {props.paypalSuccess && props.booking ? (
        <div className="mt-4 rounded-2xl border border-seafoam-400/30 bg-seafoam-500/10 p-4 text-ocean-50">
          <p className="text-lg font-extrabold">Payment Successful</p>
          <div className="mt-3 grid gap-2 text-sm">
            <SummaryLine label="Booking reference" value={props.paypalSuccess.bookingReference} />
            <SummaryLine label="Amount paid" value={`${props.paypalSuccess.amount} ${props.paypalSuccess.currency}`} />
            <SummaryLine label="PayPal order reference" value={props.paypalSuccess.orderId} />
            <SummaryLine label="PayPal transaction reference" value={props.paypalSuccess.transactionId} />
            <SummaryLine label="Tour information" value={`${getTourText(props.booking.tour, 'en').title} - ${props.booking.packageLabel}`} />
          </div>
          <Button className="mt-4" fullWidth type="button" onClick={props.onSendPaidConfirmation}>Send confirmation via WhatsApp</Button>
        </div>
      ) : null}

      {props.isSubmitting ? <p className="mt-4 text-sm font-semibold text-ocean-300">Creating booking request...</p> : null}

      {props.bookingStatus === 'pending_confirmation' && props.paymentStatus === 'pending' ? (
        <div className="mt-5 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">Booking Request Created</p>
          <p className="mt-1 text-sm">Your booking request has been created. Send the prepared message to continue.</p>
        </div>
      ) : null}

      {props.bookingStatus === 'pending_confirmation' && props.paymentStatus === 'not_required_yet' ? (
        <div className="mt-5 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">Booking Request Received</p>
          <p className="mt-1 text-sm">Your booking request has been received and is awaiting confirmation.</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col-reverse gap-3 pt-7 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="glass" onClick={props.onBack}>Back</Button>
        <span className="text-xs font-semibold text-ocean-400">Status: {props.bookingStatus.split('_').join(' ')} - Payment: {props.paymentStatus}</span>
      </div>
    </div>
  );
}

function BookingPaymentSummary({ booking }: { booking: BookingPaymentPayload | null }) {
  if (!booking) {
    return (
      <GlassPanel className="p-4 text-sm text-ocean-200" variant="subtle">
        Complete the tour selection to review the reservation summary.
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-4 text-sm" variant="subtle">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Reservation summary</p>
      <div className="mt-3 grid gap-2 text-ocean-100">
        <SummaryLine label="Customer name" value={booking.customerName || 'Required'} />
        <SummaryLine label="Phone" value={booking.phone || 'Required'} />
        <SummaryLine label="Email" value={booking.email || 'Required'} />
        <SummaryLine label="Boat" value={booking.boat.name} />
        <SummaryLine label="Tour" value={String(getTourText(booking.tour, 'en').title)} />
        <SummaryLine label="Package or duration" value={booking.packageLabel} />
        <SummaryLine label="Date" value={formatDisplayDate(booking.date)} />
        <SummaryLine label="Time" value={booking.time || 'Required'} />
        <SummaryLine label="Number of guests" value={String(booking.guests)} />
        <SummaryLine label="Boat base price" value={formatCurrency(booking.basePrice)} />
        <SummaryLine label="Additional guests" value={String(booking.additionalGuests)} />
        <SummaryLine label="Additional guest charge" value={formatCurrency(booking.additionalGuestCharge)} />
        <SummaryLine label="Departure location" value={booking.departureLocationName || 'Required'} />
        <SummaryLine label="Departure surcharge" value={booking.departureSurcharge > 0 ? formatCurrency(booking.departureSurcharge) : 'No cost'} />
        <SummaryLine label="Total price" value={formatCurrency(booking.total)} />
        <SummaryLine label="Special requests" value={booking.specialRequests || 'None'} />
      </div>
    </GlassPanel>
  );
}

function PayPalCheckoutBox(props: {
  booking: BookingPaymentPayload;
  createdBooking: BookingResult;
  onSuccess: (result: PayPalCaptureResult) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const { createdBooking, onSuccess, onError, onCancel } = props;
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const containerId = `paypal-button-container-${createdBooking.booking_id}`;
  const callbacksRef = useRef({ onSuccess, onError, onCancel });

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, onCancel };
  }, [onSuccess, onError, onCancel]);

  const buttonStyle = useMemo(
    () => ({
      layout: 'vertical',
      color: 'gold',
      shape: 'rect',
      label: 'paypal',
      height: 44,
      tagline: false,
    }),
    [],
  );

  useEffect(() => {
    let isMounted = true;
    let rendered = false;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    if (!clientId) {
      callbacksRef.current.onError('PayPal is not configured. Set VITE_PAYPAL_CLIENT_ID to enable sandbox checkout.');
      return;
    }

    if (clientId === 'mock') {
      createPayPalOrder(createdBooking.booking_id)
        .then((orderId) => capturePayPalOrder(orderId, createdBooking.booking_id, createdBooking.booking_reference))
        .then((result) => {
          if (isMounted) callbacksRef.current.onSuccess(result);
        })
        .catch((error: Error) => callbacksRef.current.onError(error.message));
      return;
    }

    loadPayPalSdk(clientId)
      .then(() => {
        if (!isMounted || !window.paypal) return;
        rendered = true;
        return window.paypal.Buttons({
          style: buttonStyle,
          createOrder: () => createPayPalOrder(createdBooking.booking_id),
          onApprove: async (data) => {
            const result = await capturePayPalOrder(data.orderID, createdBooking.booking_id, createdBooking.booking_reference);
            callbacksRef.current.onSuccess(result);
          },
          onCancel: () => callbacksRef.current.onCancel(),
          onError: (error) => callbacksRef.current.onError(getPayPalErrorMessage(error)),
        }).render(`#${containerId}`);
      })
      .catch((error: Error) => callbacksRef.current.onError(error.message));

    return () => {
      isMounted = false;
      if (!rendered) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
      }
    };
  }, [buttonStyle, clientId, containerId, createdBooking.booking_id, createdBooking.booking_reference]);

  return (
    <div className="mt-4 rounded-lg border border-ocean-400/20 bg-ocean-900/35 px-3 py-3 sm:px-4">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-3">
          <p className="text-sm font-extrabold text-white">Pago seguro con PayPal</p>
          <p className="mt-0.5 text-xs font-medium text-ocean-300">Completa tu pago de forma segura.</p>
        </div>
        <div id={containerId} className="w-full" />
      </div>
    </div>
  );
}

function BookingSummary(props: {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  date: string;
  selectedTimeSlot?: { id: string; label: string; time: string };
  guests: number;
  selectedPayment: string;
  paymentStatus: PaymentStatus;
  mealOption: string;
  pricing: ReturnType<typeof calculateBookingTotal>;
  departureLocation?: DepartureLocation;
}) {
  const { language } = useLanguage();
  const terms = getBookingTerms(language);
  const coverImage = props.selectedBoat.image;
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : tr(text.booking.selectTour, language);
  const subtotal = props.selectedTour?.customQuote ? 'Custom quote' : formatCurrency(props.pricing.basePrice);
  const extrasTotal = props.selectedTour?.customQuote ? '-' : formatCurrency(Math.max(props.pricing.total - props.pricing.basePrice - props.pricing.extraGuestsTotal - props.pricing.departureSurcharge, 0));

  return (
    <GlassPanel as="aside" className="h-fit p-3 text-white min-[420px]:p-4 sm:p-4" variant="surface">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">{tr(text.booking.summary, language)}</p>
      <img src={coverImage} alt={props.selectedBoat.name} className="mt-3 hidden aspect-[16/7] w-full rounded-xl object-cover min-[520px]:block xl:aspect-[16/8]" loading="lazy" />
      <div className="mt-3 sm:mt-4">
        <h3 className="text-lg font-extrabold text-white sm:text-xl">{props.selectedBoat.name}</h3>
        <p className="mt-1 text-sm font-semibold text-ocean-300">{props.selectedBoat.length} - {props.selectedBoat.engine}</p>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-ocean-100">
        <SummaryRow label={tr(text.booking.tourType, language)} value={props.selectedTour ? `${selectedTourName}${props.selectedTour.duration ? ` (${props.selectedTour.duration}h)` : ''}` : tr(text.booking.selectTour, language)} />
        <SummaryRow label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
        <SummaryRow label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot?.time ?? tr(text.booking.selectTime, language)} />
        <SummaryRow label={tr(text.booking.guests, language)} value={`${props.guests} ${tr(text.booking.people, language)}`} />
        {isFullDayTour(props.selectedTour) ? <SummaryRow label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
        <SummaryRow label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={props.departureLocation?.name ?? (language === 'es' ? 'No seleccionado' : 'Not selected')} />
      </div>
      <GlassPanel className="mt-4 p-3 sm:mt-5 sm:p-4" variant="subtle">
        <SummaryRow label={language === 'es' ? 'Precio base' : 'Base price'} value={subtotal} />
        <SummaryRow label={language === 'es' ? 'Incluye hasta' : 'Includes up to'} value={`${getTourIncludedGuests(props.selectedBoat, props.selectedTour)} ${language === 'es' ? 'personas' : 'guests'}`} />
        {props.pricing.extraGuests > 0 ? <SummaryRow label={tr(text.booking.extraPeople, language)} value={`${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)}`} /> : null}
        <SummaryRow label={language === 'es' ? 'Cargo por salida' : 'Departure surcharge'} value={props.pricing.departureSurcharge > 0 ? formatCurrency(props.pricing.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
        <SummaryRow label={tr(text.booking.taxes, language)} value={extrasTotal} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
          <span className="font-extrabold text-white">Total</span>
          <span className="text-2xl font-extrabold text-ocean-400">{props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total)}</span>
        </div>
      </GlassPanel>
      <p className="mt-4 text-xs font-medium text-ocean-300">{tr(text.booking.secure, language)}</p>
      <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-ocean-300">
        {terms.slice(0, 3).map((term) => (
          <p key={term}>{term}</p>
        ))}
      </div>
    </GlassPanel>
  );
}

function BookingProgressSummary(props: {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  date: string;
  selectedTimeSlot?: { id: string; label: string; time: string };
  guests: number;
  mealOption: string;
  pricing: ReturnType<typeof calculateBookingTotal>;
  departureLocation?: DepartureLocation;
  activeStep: number;
}) {
  const { language } = useLanguage();
  const total = props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total);
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : tr(text.booking.selectTour, language);

  return (
    <GlassPanel as="aside" className="p-3 text-white" variant="surface">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{tr(text.booking.summary, language)}</p>
          <p className="mt-1 truncate text-sm font-extrabold text-white">{props.selectedBoat.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-ocean-300">Total</p>
          <p className="text-lg font-extrabold text-ocean-400">{total}</p>
        </div>
      </div>

      {props.activeStep >= 1 ? (
        <div className="mt-3 grid min-w-0 gap-2 border-t border-white/10 pt-3 text-xs text-ocean-100 min-[520px]:grid-cols-3">
          <SummaryMini label={tr(text.booking.tourType, language)} value={selectedTourName} />
          <SummaryMini label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
          <SummaryMini label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot?.time ?? tr(text.booking.selectTime, language)} />
          {props.activeStep >= 2 ? <SummaryMini label={language === 'es' ? 'Lugar' : 'Location'} value={props.departureLocation?.name ?? (language === 'es' ? 'Pendiente' : 'Pending')} /> : null}
          {isFullDayTour(props.selectedTour) ? <SummaryMini label="Meal" value={props.mealOption || 'Not selected'} /> : null}
        </div>
      ) : null}

      {props.activeStep >= 2 ? (
        <div className="mt-3 flex flex-wrap justify-between gap-3 rounded-xl border border-ocean-500/20 bg-ocean-900/60 p-3 text-sm">
          <span className="text-ocean-300">{tr(text.booking.guests, language)}</span>
          <span className="font-bold text-white">{props.guests} {tr(text.booking.people, language)}</span>
        </div>
      ) : null}
    </GlassPanel>
  );
}

function SummaryMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <p className="text-ocean-400">{label}</p>
      <p className="truncate font-bold text-white">{value}</p>
    </div>
  );
}

function ReviewModal(props: {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  date: string;
  departure: string;
  guests: number;
  mealOption: string;
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  specialRequests: string;
  paymentMethod: string;
  pricing: ReturnType<typeof calculateBookingTotal>;
  departureLocation?: DepartureLocation;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { language } = useLanguage();
  const terms = getBookingTerms(language);
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : (language === 'es' ? 'No seleccionado' : 'Not selected');
  return (
    <ModalShell open onClose={props.onBack} titleId="booking-review-title" className="max-h-[calc(100dvh-1rem)] max-w-xl overflow-y-auto p-3 text-white sm:max-h-[calc(100dvh-2rem)] sm:p-5">
        <img className="mb-3 aspect-[16/5] w-full rounded-lg object-cover sm:mb-4" src={props.selectedBoat.image} alt={props.selectedBoat.name} loading="lazy" />
        <h3 id="booking-review-title" className="text-2xl font-extrabold text-white sm:text-3xl">{language === 'es' ? 'Revisar reserva' : 'Review reservation'}</h3>
        <p className="mt-2 text-sm leading-6 text-ocean-200 sm:mt-3 sm:text-base sm:leading-7">
          {language === 'es' ? 'Revisa los detalles antes de confirmar la solicitud. La disponibilidad y el metodo de pago seleccionado se validan al crear la reserva.' : 'Review your reservation details before confirming this request. Availability and the selected payment method are validated when the booking is created.'}
        </p>
        <GlassPanel className="mt-3 grid gap-2 p-3 text-[0.8rem] sm:mt-4 sm:gap-2.5 sm:text-sm" variant="subtle">
          <SummaryLine label={language === 'es' ? 'Barco' : 'Boat'} value={props.selectedBoat.name} />
          <SummaryLine label="Tour" value={selectedTourName} />
          <SummaryLine label={language === 'es' ? 'Fecha' : 'Date'} value={formatDisplayDate(props.date)} />
          <SummaryLine label={language === 'es' ? 'Salida' : 'Departure time'} value={props.departure} />
          <SummaryLine label={language === 'es' ? 'Personas' : 'Guests'} value={String(props.guests)} />
          {isFullDayTour(props.selectedTour) ? <SummaryLine label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
          <SummaryLine label={language === 'es' ? 'Cargos por personas extra' : 'Additional guest charges'} value={props.pricing.extraGuests > 0 ? `${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : '$0'} />
          <SummaryLine label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={props.departureLocation?.name ?? '-'} />
          <SummaryLine label={language === 'es' ? 'Cargo por salida' : 'Departure surcharge'} value={props.pricing.departureSurcharge > 0 ? formatCurrency(props.pricing.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
          <SummaryLine label="Total" value={props.pricing.isCustomQuote ? 'Custom quote' : formatCurrency(props.pricing.total)} />
          <SummaryLine label={language === 'es' ? 'Nombre' : 'Customer name'} value={props.customerName} />
          <SummaryLine label="Email" value={props.customerEmail} />
          <SummaryLine label={language === 'es' ? 'Numero de WhatsApp' : 'WhatsApp number'} value={props.customerWhatsapp} />
          <SummaryLine label="Special requests" value={props.specialRequests || 'None'} />
          <SummaryLine label={language === 'es' ? 'Metodo de pago' : 'Payment method'} value={props.paymentMethod} />
        </GlassPanel>
        <GlassPanel className="mt-3 grid gap-1.5 p-3 text-[0.72rem] leading-5 text-ocean-200 sm:text-xs" variant="subtle">
          {terms.map((term) => (
            <p key={term}>{term}</p>
          ))}
        </GlassPanel>
        <div className="sticky -bottom-3 mt-4 flex flex-col-reverse gap-2 border-t border-white/10 bg-ocean-950/95 pt-3 backdrop-blur sm:-bottom-5 sm:flex-row sm:justify-end">
          <Button variant="glass" type="button" onClick={props.onBack}>
            {language === 'es' ? 'Volver' : 'Go Back'}
          </Button>
          <Button type="button" onClick={props.onConfirm}>
            {language === 'es' ? 'Confirmar reserva' : 'Confirm reservation'}
          </Button>
        </div>
    </ModalShell>
  );
}

function BookingSuccessModal(props: {
  notice: { title: string; message: string; reference?: string };
  onClose: () => void;
}) {
  return (
    <ModalShell open onClose={props.onClose} titleId="booking-success-title" className="max-w-md p-5 text-white sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-seafoam-400/15 text-seafoam-200">
          <Info size={20} />
        </span>
        <div className="min-w-0">
          <h3 id="booking-success-title" className="text-xl font-extrabold text-white">{props.notice.title}</h3>
          <p className="mt-2 text-sm leading-6 text-ocean-200">{props.notice.message}</p>
          {props.notice.reference ? (
            <div className="mt-4 rounded-lg border border-ocean-400/20 bg-ocean-900/35 p-3 text-sm">
              <span className="block text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Referencia</span>
              <span className="mt-1 block font-extrabold text-white">{props.notice.reference}</span>
            </div>
          ) : null}
        </div>
      </div>
      <Button className="mt-5" fullWidth type="button" onClick={props.onClose}>Cerrar</Button>
    </ModalShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
      <span className="text-ocean-300">{label}</span>
      <span className="text-right font-bold text-white">{value}</span>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
      <span className="font-semibold text-ocean-300">{label}</span>
      <span className="min-w-0 max-w-full break-words text-right font-bold text-white">{value}</span>
    </div>
  );
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
