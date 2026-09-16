import { ArrowLeft, ArrowRight, Check, CreditCard, Info, Mail, MapPin, Minus, MessageCircle, Phone, Plus, Ship, User, WalletCards } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getPackageLabel, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { MOCK_TURNSTILE_TOKEN, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { cancelPayPalOrder, capturePayPalOrder, createPayPalOrder, getPayPalErrorMessage, loadPayPalSdk, type PayPalCaptureResult } from '../../services/paypalService';
import { getBookingAvailability, type AvailabilitySlot } from '../../services/availabilityService';
import { calculateBookingPrice, createBooking, getActiveDepartureLocations, type BookingResult, type DepartureLocation, type PriceResult } from '../../services/bookingService';
import { getActivePaymentMethods } from '../../services/paymentService';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { buildBookingPaymentPayload, createWhatsAppBookingMessage, getWhatsAppBookingUrl, type BookingPaymentMethod, type BookingStatus, type BookingPaymentPayload, type PaymentStatus } from '../../utils/bookingPayment';
import { calculateBookingTotal, getBoatStartingPrice, getEffectiveMaxGuests, getExtraGuestPrice, getTourIncludedGuests } from '../../utils/bookingPricing';
import { isBookableCatalogPackage } from '../../utils/tourCatalog';
import { filterPackageSlots } from '../../utils/packageSettings';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/format';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button, ChoiceCard, Field, FieldError, GlassPanel, Input, ModalShell, TextArea } from '../ui';

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

function getPaymentMethodCopy(id: BookingPaymentMethod, language: 'es' | 'en') {
  if (language === 'en') return paymentMethods.find((method) => method.id === id) ?? paymentMethods[0];
  const copy: Record<BookingPaymentMethod, { title: string; description: string }> = {
    paypal: { title: 'Pagar con PayPal', description: 'Checkout seguro en USD.' },
    'whatsapp-link': { title: 'Solicitar enlace por WhatsApp', description: 'Solicita un enlace de pago.' },
    'pay-on-day': { title: 'Pagar el día del tour', description: 'Paga cuando inicie el tour.' },
  };
  const method = paymentMethods.find((item) => item.id === id) ?? paymentMethods[0];
  return { ...method, ...copy[id] };
}

export function getBookingTerms(language: 'es' | 'en') {
  return language === 'es'
    ? [
        'La solicitud queda sujeta a confirmación de disponibilidad por nuestro equipo.',
        'Metodos de pago: PayPal, enlace de pago por WhatsApp o pago el dia del tour.',
        'Cancelacion al menos 3 dias antes del tour: reembolso del 100% sin penalidad.',
        'Cancelacion dentro de 3 dias: penalidad del 30% por costos operativos y alquiler del bote. Reprogramar dentro de 3 dias es permitido segun disponibilidad.',
        'Cancelacion dentro de 24 horas: penalidad del 100% por costos operativos, alquiler del bote, comida y bebidas.',
        'Reembolso o reprogramacion por clima solo aplica por huracanes, pronostico de oleaje fuerte, vientos altos o lluvia fuerte dentro de 24 horas antes del tour. Dias nublados o poca luz solar no califican.',
      ]
    : [
        'Your request remains subject to availability confirmation by our team.',
        'Payment methods: PayPal, WhatsApp payment link or pay on the day of the tour.',
        'Cancellation at least 3 days before the tour: 100% refund without penalty.',
        'Cancellation within 3 days: 30% penalty due to operational and boat rental costs. Rescheduling within 3 days is allowed for another available date, subject to availability.',
        'Cancellation within 24 hours: 100% penalty due to operational, boat rental, food and beverage costs.',
        'Refund or rescheduling for weather applies only to hurricanes, strong wave forecasts, high winds or heavy rain within 24 hours before the tour. Cloudy days or limited sunlight do not qualify.',
      ];
}

export function BookingPanel({ selectedBoat, selectedTour: requestedTour, boats, tours, catalogLoading, selectedTimeSlotId, onBoatChange, onTourChange }: BookingPanelProps) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const selectedTour = tours.find((item) => item.id === requestedTour?.id && item.boatId === selectedBoat.id
    && item.tourId === requestedTour?.tourId && item.boatTourId === requestedTour?.boatTourId
    && isBookableCatalogPackage(item));
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
  const [paypalInfo, setPaypalInfo] = useState('');
  const [paypalSuccess, setPaypalSuccess] = useState<PayPalCaptureResult | null>(null);
  const [successNotice, setSuccessNotice] = useState<{ title: string; message: string; reference?: string } | null>(null);
  const [createdBooking, setCreatedBooking] = useState<BookingResult | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const availabilityAlertKey = useRef('');
  const parentIdentity = selectedBoat.id + ':' + (selectedTour?.boatTourId ?? '') + ':' + (selectedTour?.id ?? '');
  const previousParent = useRef(parentIdentity);
  useEffect(() => {
    if (previousParent.current === parentIdentity) return;
    previousParent.current = parentIdentity;
    setMealOption('');
    setTimeSlotId(selectedTour?.timeSlots[0]?.id ?? '');
    setGuests(getTourIncludedGuests(selectedBoat, selectedTour));
    setBookingStatus('pending');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    setPaypalError('');
    setPaypalInfo('');
    setPaypalSuccess(null);
    setCreatedBooking(null);
    setSuccessNotice(null);
    setIsPayOnDayOpen(false);
    setValidationMessage('');
    setActiveStep(selectedTour ? 1 : 0);
  }, [parentIdentity, selectedBoat, selectedTour]);

  const availableTours = useMemo(() => tours.filter((tour) => tour.boatId === selectedBoat.id && isBookableCatalogPackage(tour)), [selectedBoat.id, tours]);
  const availabilityQuery = useQuery({
    queryKey: ['availability', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, date],
    queryFn: () => getBookingAvailability(selectedBoat.id, selectedTour?.tourId ?? '', selectedTour?.id ?? '', date),
    enabled: Boolean(selectedBoat.id && selectedTour?.tourId && selectedTour?.id && date),
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
      tourId: selectedTour?.tourId ?? '',
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
  const currentSlots = useMemo(() => filterPackageSlots(selectedTour, availabilityQuery.data ?? (selectedTour?.timeSlots ?? []).map((slot) => ({ ...slot, available: true }))), [selectedTour, availabilityQuery.data]);
  const selectedTimeSlot = currentSlots.find((slot) => slot.id === timeSlotId);
  const selectedPayment = backendPaymentMethods.find((method) => method.id === paymentMethod) ?? backendPaymentMethods[0];
  const steps = [tr(text.booking.steps.boat, language), tr(text.booking.steps.tour, language), language === 'es' ? 'Lugar de salida' : 'Departure location', language === 'es' ? 'Tus datos y pago' : 'Your details and payment'];
  const hasCapacityError = guests > effectiveMaxGuests;
  const canContinueToCustomer = Boolean(selectedTour && selectedTimeSlot && !hasCapacityError && !priceQuery.isError && !availabilityQuery.isError && !availabilityQuery.isFetching && selectedTimeSlot.available !== false);
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
    if (!currentSlots.some((slot) => slot.id === timeSlotId && slot.available !== false)) {
      setTimeSlotId(currentSlots.find((slot) => slot.available !== false)?.id ?? '');
    }
  }, [currentSlots, timeSlotId]);

  useEffect(() => {
    if (mealOption && !(selectedTour?.mealOptions ?? []).some((meal) => meal.es === mealOption || meal.en === mealOption)) setMealOption('');
  }, [mealOption, selectedTour]);

  useEffect(() => {
    if (!selectedTour || availabilityQuery.isFetching || availabilityQuery.isError || !availabilityQuery.data) return;
    const unavailableKey = selectedBoat.id + ':' + date + ':' + selectedTour.id;
    const allUnavailable = currentSlots.length > 0 && currentSlots.every((slot) => slot.available === false);
    if (allUnavailable && availabilityAlertKey.current !== unavailableKey) {
      availabilityAlertKey.current = unavailableKey;
      window.alert(language === 'es'
        ? 'No hay horarios disponibles para este bote en la fecha seleccionada.'
        : 'There are no departure times available for this boat on the selected date.');
    }
  }, [currentSlots, availabilityQuery.data, availabilityQuery.isError, availabilityQuery.isFetching, date, language, selectedBoat.id, selectedTour]);

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
    setMealOption('');
    setTimeSlotId('');
    setGuests(getTourIncludedGuests(nextBoat, undefined));
    setBookingStatus('pending');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    setPaypalInfo('');
    setPaypalSuccess(null);
    setCreatedBooking(null);
  }

  function handleTourChange(tourId: string) {
    const nextTour = availableTours.find((tour) => tour.id === tourId);
    onTourChange(nextTour);
    setTimeSlotId(nextTour?.timeSlots[0]?.id ?? '');
    if (nextTour) setGuests(getTourIncludedGuests(selectedBoat, nextTour));
    setMealOption('');
    setBookingStatus('pending');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    setPaypalInfo('');
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
      queryClient.invalidateQueries({ queryKey: ['availability', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, date] });
    },
    onError: (error: Error & { status?: number }) => {
      setTurnstileToken('');
      setTurnstileResetKey((value) => value + 1);
      if (error.status === 409) {
        setValidationMessage(language === 'es'
          ? 'Ese horario ya no está disponible para este bote. Elige otro horario.'
          : 'That time is no longer available for this boat. Please choose another time.');
        queryClient.invalidateQueries({ queryKey: ['availability', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, date] });
        setActiveStep(1);
        return;
      }
      setValidationMessage(error.message || 'We couldn’t create the booking. Please try again.');
    },
  });

  async function submitBooking(method: BookingPaymentMethod) {
    const booking = validateBookingForPayment();
    if (!booking || !selectedTour || !selectedTimeSlot) return null;
    if (!selectedTour.tourId) {
      setValidationMessage(language === 'es' ? 'Este tour no está disponible para reservar.' : 'This tour is not available to book.');
      return null;
    }
    const result = await createBookingMutation.mutateAsync({
      customer: { fullName: customerName, email: customerEmail, whatsapp: customerWhatsapp },
      boatId: selectedBoat.id,
      tourId: selectedTour.tourId,
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
    const url = getWhatsAppBookingUrl(createWhatsAppBookingMessage(booking, variant));
    window.location.assign(url);
  }

  function handlePaymentLinkRequest() {
    submitBooking('whatsapp-link').then((result) => {
      if (!result || !bookingPayload) return;
      setPaymentMethod('whatsapp-link');
      setBookingStatus('pending_confirmation');
      setPaymentStatus('pending');
      setPaypalVisible(false);
      setSuccessNotice(null);
      openWhatsAppBooking({ ...bookingPayload, bookingReference: result.booking_reference, total: result.total_snapshot, paymentMethod: 'WhatsApp payment link', paymentStatus: 'pending' }, 'payment_link');
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
      openWhatsAppBooking({ ...bookingPayload, bookingReference: result.booking_reference, total: result.total_snapshot, paymentMethod: 'Pay on the day of the tour', paymentStatus: 'not_required_yet' }, 'pay_on_day');
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
      setPaypalInfo(language === 'es' ? 'Completa el pago en PayPal. Cuando el pago se confirme, en unos momentos recibirás un correo. Muchas gracias por reservar.' : 'Complete your PayPal payment. Once it is confirmed, you will receive an email in a few moments. Thank you for booking.');
      setPaypalVisible(true);
    }).catch(() => undefined);
  }

  const summaryProps = {
    selectedBoat,
    selectedTour,
    date,
    selectedTimeSlot,
    guests,
    selectedPayment: selectedPayment.title,
    paymentStatus,
    mealOption,
    pricing,
    departureLocation: selectedDepartureLocation,
    currentStep: activeStep,
  };

  return (
    <div className="relative pb-36 text-white lg:pb-0">
      {/* Desktop: horizontal 4-step stepper (unchanged shape). Mobile: compact
          "Step X of 4" + progress bar (tie-break rule 3 — never the four
          circles squeezed down). */}
      <div className="hidden lg:block">
        <GlassPanel className="relative mx-auto grid max-w-lg grid-cols-4 items-start gap-1.5 px-2 py-1.5" variant="subtle">
          {steps.map((step, index) => (
            <button
              key={step}
              className={cn(
                'glass-focus-ring group relative grid min-w-0 justify-items-center gap-1 rounded-xl px-1.5 py-0.5 text-center transition-colors duration-200',
                index < steps.length - 1 && 'after:absolute after:left-[calc(50%+1rem)] after:top-3 after:h-px after:w-[calc(100%-2rem)]',
                index < activeStep ? 'after:bg-ocean-100/60' : 'after:bg-[var(--surface-border)]',
              )}
              type="button"
              aria-current={activeStep === index ? 'step' : undefined}
              aria-disabled={!canVisitStep(index)}
              onClick={() => goToStep(index)}
            >
              <GlassPanel as="span" className={cn('grid h-6 w-6 place-items-center text-[0.68rem] font-extrabold transition-[background-color,border-color,color,box-shadow] duration-200', activeStep === index ? 'glass-selected text-white' : activeStep > index ? 'bg-ocean-100 text-ocean-950' : 'text-ocean-300')} shape="circle" variant="control">
                {index + 1}
              </GlassPanel>
              <span className={cn('max-w-full text-[0.6rem] font-bold leading-tight', activeStep === index ? 'text-ocean-200' : 'text-ocean-500')}>{step}</span>
            </button>
          ))}
        </GlassPanel>
      </div>
      <div className="lg:hidden">
        <MobileStepper activeStep={activeStep} stepLabel={steps[activeStep]} totalSteps={steps.length} />
      </div>

      <span data-nav-frame-end aria-hidden="true" />

      <div className="relative mt-3 grid gap-5 lg:mt-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left column: step content card + action bar, wrapped together so
            the grid above only ever sees two direct children (one per
            column) — three direct children in a 2-column grid auto-place
            into a second implicit row instead of stacking within column 1,
            which is what threw the action bar into the right column and
            the summary underneath the left one.

            Deliberately NOT force-stretched to the summary's own full
            height: the summary's natural content (image + full pricing
            breakdown) runs taller than one viewport on its own, so making
            this column match it verbatim pushed the action bar off-screen
            below the fold — worse than the mismatch it was meant to fix.
            Heights are narrowed instead by compacting BookingSummary
            itself (still the same component/content, just tighter
            spacing) so the two columns land close without forcing it. */}
        <div>
        <GlassPanel className="p-3 sm:p-4" variant="surface">
          {/* Step-change focus target (a11y): moves keyboard/screen-reader
              focus to the newly revealed step content, since there's no
              fixed per-step heading anchor outside this card. */}
          <div ref={headingRef} className="outline-none" tabIndex={-1}>
            {activeStep === 0 ? (
              <BoatStep boats={boats} tours={tours} selectedBoat={selectedBoat} catalogLoading={catalogLoading} onBoatChange={handleBoatChange} />
            ) : null}

            {activeStep === 1 ? (
              <TourDetailsStep
                selectedBoat={selectedBoat}
                selectedTour={selectedTour}
                availableTours={availableTours}
                date={date}
                guests={guests}
                timeSlotId={timeSlotId}
                effectiveMaxGuests={effectiveMaxGuests}
                availabilitySlots={currentSlots}
                availabilityLoading={availabilityQuery.isFetching}
                availabilityError={availabilityQuery.isError}
                mealOption={mealOption}
                hasCapacityError={hasCapacityError}
                onTourChange={handleTourChange}
                onDateChange={setDate}
                onGuestsChange={setGuests}
                onMealOptionChange={setMealOption}
                onTimeSlotChange={(slotId) => {
                  const slot = currentSlots.find((item) => item.id === slotId);
                  if (slot?.available === false) {
                    window.alert(language === 'es' ? 'Ese horario ya no está disponible para este bote.' : 'That departure time is no longer available for this boat.');
                    return;
                  }
                  setTimeSlotId(slotId);
                }}
              />
            ) : null}

            {activeStep === 2 ? (
              <DepartureLocationStep
                locations={departureLocations}
                selectedLocationId={departureLocationId}
                loading={departureLocationsQuery.isFetching}
                error={departureLocationsQuery.isError}
                onLocationChange={setDepartureLocationId}
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
                paypalInfo={paypalInfo}
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
                    message: language === 'es'
                      ? 'Tu pago fue procesado. En unos momentos recibirás un correo con la confirmación de tu reserva. Muchas gracias por reservar con nosotros.'
                      : 'Your payment was processed. In a few moments you will receive a confirmation email for your reservation.',
                    reference: result.bookingReference,
                  });
                }}
                onPayPalError={(message) => {
                  setPaypalError(message);
                  setBookingStatus('pending_payment');
                  setPaymentStatus('pending');
                }}
                onPayPalCancel={() => {
                  setPaypalError('Payment was cancelled. You can try again or select another payment method.');
                  setBookingStatus('pending_payment');
                  setPaymentStatus('pending');
                }}
                onSendPaidConfirmation={() => {
                  const booking = validateBookingForPayment();
                  if (booking) openWhatsAppBooking({ ...booking, paymentMethod: 'PayPal', paymentStatus: 'paid' }, 'paid_confirmation');
                }}
              />
            ) : null}
          </div>
        </GlassPanel>
        {validationMessage && activeStep !== 3 ? <div className="mt-3"><FieldError variant="panel">{validationMessage}</FieldError></div> : null}

        {/* Rendered as a sibling of the GlassPanel above, never nested
            inside it: `.glass-surface` uses `backdrop-filter`, and any
            ancestor with backdrop-filter/filter/transform becomes the
            containing block for `position:fixed` descendants — nesting the
            mobile sticky bar inside that card made it anchor to the card's
            own box instead of the real viewport.

            Mobile only: carries a small always-visible, non-collapsible
            summary strip (boat + this step's own selection + total) right
            above the action buttons, reusing the same state as the desktop
            BookingSummary below — no second source of truth, no accordion. */}
        <StepActionBar
          backLabel={tr(text.booking.back, language)}
          onBack={activeStep > 0 ? () => setActiveStep(activeStep - 1) : undefined}
          primaryLabel={activeStep < 3 ? tr(text.booking.continue, language) : undefined}
          primaryDisabled={
            activeStep === 1 ? !canContinueToCustomer
              : activeStep === 2 ? (!departureLocationId || departureLocationsQuery.isFetching || departureLocationsQuery.isError || departureLocations.length === 0)
              : false
          }
          onPrimary={
            activeStep === 0 ? () => setActiveStep(1)
              : activeStep === 1 ? () => setActiveStep(2)
              : activeStep === 2 ? () => {
                if (!departureLocationId) {
                  setValidationMessage('Please select a departure location.');
                  return;
                }
                setValidationMessage('');
                setActiveStep(3);
              }
              : undefined
          }
          summaryLabel={
            activeStep === 1
              ? `${selectedBoat.name} · ${selectedTour ? getTourText(selectedTour, language).title : tr(text.booking.selectTour, language)}`
              : activeStep === 2
                ? `${selectedBoat.name} · ${selectedDepartureLocation?.name ?? (language === 'es' ? 'Sin lugar de salida' : 'No departure location')}`
                : selectedBoat.name
          }
          summaryTotal={selectedTour?.customQuote ? (language === 'es' ? 'Cotizar' : 'Quote') : formatCurrency(pricing.total)}
        />
        </div>

        {/* The one persistent reservation summary — desktop only here,
            always open, stays in the right column for the whole flow,
            unmoved and unredesigned. */}
        <div className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <BookingSummary {...summaryProps} />
        </div>
      </div>

      {isPayOnDayOpen && bookingPayload ? (
        <ReviewModal
          selectedBoat={selectedBoat}
          selectedTour={selectedTour}
          date={date}
          departure={selectedTimeSlot ? formatTime(selectedTimeSlot.time) : 'Not selected'}
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
        <BookingSuccessModal notice={successNotice} onClose={() => { setSuccessNotice(null); window.location.assign('/'); }} />
      ) : null}
    </div>
  );
}

/** Compact "Step X of 4 / [step name] / progress bar" — mobile only (tie-break rule 3). */
function MobileStepper(props: { activeStep: number; stepLabel: string; totalSteps: number }) {
  const { language } = useLanguage();
  const progress = ((props.activeStep + 1) / props.totalSteps) * 100;
  return (
    <div>
      <p className="text-xs font-bold text-ocean-300">
        {language === 'es' ? `Paso ${props.activeStep + 1} de ${props.totalSteps}` : `Step ${props.activeStep + 1} of ${props.totalSteps}`}
      </p>
      <p className="mt-0.5 text-base font-extrabold text-white">{props.stepLabel}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-ocean-100 transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

/** Back / Continue row shared by all 4 steps, plus (mobile only) a small
 * fixed, always-visible reservation summary strip stacked right above it —
 * never a collapsible/accordion summary. Desktop: static, right after the
 * step's own content, no strip (the real summary lives in the right
 * column). Mobile: both rows fixed to the viewport bottom with a navy/glass
 * backdrop and safe-area padding. */
function StepActionBar(props: { onBack?: () => void; backLabel: string; primaryLabel?: string; primaryDisabled?: boolean; onPrimary?: () => void; primaryType?: 'button' | 'submit'; summaryLabel: string; summaryTotal: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 lg:static lg:z-auto">
      <div className="border-t border-white/10 bg-ocean-950/95 px-4 py-2 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs font-semibold text-ocean-100">{props.summaryLabel}</span>
          <span className="shrink-0 text-sm font-extrabold text-white">{props.summaryTotal}</span>
        </div>
      </div>
      <div
        className="flex gap-3 border-t border-white/10 bg-ocean-950/92 px-4 py-3 backdrop-blur-md lg:mt-5 lg:border-t lg:border-white/10 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-4 lg:backdrop-blur-none"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {props.onBack ? (
          <Button className="lg:min-w-[140px]" type="button" variant="glass" onClick={props.onBack}>
            <ArrowLeft aria-hidden="true" size={16} />
            {props.backLabel}
          </Button>
        ) : null}
        {props.primaryLabel ? (
          <Button
            className={cn('ml-auto lg:min-w-[170px]', !props.onBack && 'w-full lg:w-auto')}
            disabled={props.primaryDisabled}
            type={props.primaryType ?? 'button'}
            onClick={props.onPrimary}
          >
            {props.primaryLabel}
            <ArrowRight aria-hidden="true" size={16} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Small selected-state indicator used on every card type in the flow. */
function ChoiceCheck({ selected }: { selected: boolean }) {
  return (
    <span aria-hidden="true" className={`absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full border ${selected ? 'border-ocean-100 bg-ocean-100 text-ocean-950' : 'border-ocean-200/60'}`}>
      {selected ? <Check size={12} strokeWidth={3} /> : null}
    </span>
  );
}

function SelectedCheck() {
  return (
    <span className="absolute right-2 top-2 grid size-5 shrink-0 place-items-center rounded-full bg-ocean-100 text-ocean-950">
      <Check aria-hidden="true" size={12} strokeWidth={3} />
    </span>
  );
}

function BoatStep(props: { boats: Boat[]; tours: BoatTour[]; selectedBoat: Boat; catalogLoading?: boolean; onBoatChange: (boatId: string) => void }) {
  const { language } = useLanguage();

  return (
    <div>
      <div className="flex items-center gap-3 text-white">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ocean-500/15 text-ocean-300 sm:h-9 sm:w-9"><Ship size={17} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.privateFleet, language)}</p>
          <h3 className="text-base font-extrabold text-white sm:text-lg">{tr(text.booking.chooseBoat, language)}</h3>
        </div>
      </div>
      {/* Desktop only: scrolls internally once the fleet outgrows this
          bounded area, so the action bar below always stays reachable
          without the whole page having to grow. */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:max-h-[360px] lg:overflow-y-auto lg:pr-1">
        {props.catalogLoading ? <p className="text-sm font-semibold text-ocean-200 sm:col-span-2">{language === 'es' ? 'Cargando barcos...' : 'Loading boats...'}</p> : null}
        {props.boats.map((boat) => {
          const selected = props.selectedBoat.id === boat.id;
          return (
            <ChoiceCard
              key={boat.id}
              className="relative flex items-center gap-2.5 p-3 text-left"
              selected={selected}
              onClick={() => props.onBoatChange(boat.id)}
            >
              {selected ? <SelectedCheck /> : null}
              <img src={boat.image} alt={boat.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <span className="block truncate pr-6 text-sm font-extrabold text-white">{boat.name}</span>
                <span className="block truncate text-xs font-medium text-ocean-300">{boat.length} · {boat.engine}</span>
                {boat.featuredSpec ? <span className="block truncate text-[0.7rem] leading-4 text-ocean-400">{boat.featuredSpec}</span> : null}
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-ocean-400">{language === 'es' ? 'Desde' : 'From'}</span>
                  <span className="text-sm font-extrabold text-ocean-100">{formatCurrency(getBoatStartingPrice(boat.id, props.tours))}</span>
                </div>
              </div>
            </ChoiceCard>
          );
        })}
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
  effectiveMaxGuests: number;
  availabilitySlots: Array<{ id: string; label: string; time: string; available?: boolean }>;
  availabilityLoading: boolean;
  availabilityError: boolean;
  mealOption: string;
  hasCapacityError: boolean;
  onTourChange: (tourId: string) => void;
  onDateChange: (date: string) => void;
  onGuestsChange: (guests: number) => void;
  onMealOptionChange: (meal: string) => void;
  onTimeSlotChange: (slotId: string) => void;
}) {
  const { language } = useLanguage();
  const tourGroups = getBookingTourGroups(props.availableTours, language);
  const activeGroup = props.selectedTour ? (props.selectedTour.tourId ?? props.selectedTour.id) : '';
  const activeGroupData = tourGroups.find((group) => group.key === activeGroup);

  return (
    <div className="grid gap-4 text-white">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.tourDetails, language)}</p>
        <h3 className="mt-1 text-lg font-extrabold text-white sm:text-xl">{tr(text.booking.buildReservation, language)}</h3>
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.tourAboard, language)} {props.selectedBoat.name}</legend>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {tourGroups.map((group) => {
            const selected = activeGroup === group.key;
            return (
              <ChoiceCard
                key={group.key}
                className="relative flex min-h-[52px] flex-col justify-center px-3 py-2"
                selected={selected}
                onClick={() => props.onTourChange(group.tours[0].id)}
              >
                {selected ? <SelectedCheck /> : null}
                <span className="block truncate pr-6 text-sm font-extrabold text-white">{group.label}</span>
                <span className="mt-0.5 block text-xs font-bold text-ocean-400">{language === 'es' ? 'Desde' : 'From'} {formatCurrency(group.tours[0].basePrice)}</span>
              </ChoiceCard>
            );
          })}
        </div>
      </fieldset>

      {activeGroupData && activeGroupData.tours.length > 1 ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Escoge paquete o duracion' : 'Choose package or duration'}</legend>
          <div className="mt-2.5 grid gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {activeGroupData.tours.map((tour) => (
              <ChoiceCard as="label" key={tour.id} className="relative flex min-h-[48px] cursor-pointer flex-col justify-center py-1.5 pl-3 pr-10" selected={props.selectedTour?.id === tour.id}>
                <input className="sr-only" type="radio" name="tourPackage" value={tour.id} checked={props.selectedTour?.id === tour.id} onChange={() => props.onTourChange(tour.id)} />
                <ChoiceCheck selected={props.selectedTour?.id === tour.id} />
                <span className="block truncate text-xs font-extrabold text-white">{getPackageLabel(tour, language)}</span>
                <span className="mt-0.5 block text-sm font-extrabold text-ocean-100">{formatCurrency(tour.basePrice)}</span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      ) : null}

      {Boolean(props.selectedTour?.mealOptions?.length) ? (
        <GlassPanel as="fieldset" className="p-3" variant="subtle">
          <legend className="px-1 text-sm font-bold text-ocean-100">{language === 'es' ? 'Escoge tu comida incluida' : 'Choose your included meal'}</legend>
          <div className="mt-2.5 grid gap-1.5 min-[420px]:grid-cols-2">
            {(props.selectedTour?.mealOptions ?? []).map((meal) => (
              <ChoiceCard as="label" key={meal.en} className="relative flex min-h-[44px] cursor-pointer items-center py-2 pl-2.5 pr-10 text-xs font-bold leading-4 text-ocean-100" selected={props.mealOption === meal.es || props.mealOption === meal.en}>
                <input className="sr-only" type="radio" name="mealOption" value={meal[language]} checked={props.mealOption === meal.es || props.mealOption === meal.en} onChange={() => props.onMealOptionChange(meal[language])} />
                <ChoiceCheck selected={props.mealOption === meal.es || props.mealOption === meal.en} />
                {meal[language]}
              </ChoiceCard>
            ))}
          </div>
          <button className="glass-focus-ring mt-3 rounded-sm text-xs font-bold text-ocean-400 underline-offset-4 hover:underline" type="button" onClick={() => props.onMealOptionChange('')}>
            {language === 'es' ? 'Sin comida seleccionada' : 'No meal selected'}
          </button>
        </GlassPanel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field htmlFor="booking-date" label={tr(text.booking.date, language)} labelClassName="text-sm font-bold">
          <Input id="booking-date" className="min-w-0 max-w-full appearance-none px-3 py-2 text-[0.8rem] tracking-tight sm:px-4 sm:text-sm" tone="ocean" type="date" value={props.date} onChange={(event) => props.onDateChange(event.target.value)} />
        </Field>
        <Field error={props.hasCapacityError ? (language === 'es' ? `Este barco tiene capacidad maxima de ${props.effectiveMaxGuests} personas.` : `This boat has a maximum capacity of ${props.effectiveMaxGuests} guests.`) : undefined} errorId="booking-guests-error" htmlFor="booking-guests" label={tr(text.booking.guests, language)} labelClassName="text-sm font-bold">
          <div className="flex h-10 items-center justify-between rounded-full border border-white/10 bg-ocean-900/70 px-2">
            <button
              aria-label={language === 'es' ? 'Restar persona' : 'Decrease guests'}
              className="glass-focus-ring grid size-8 shrink-0 place-items-center rounded-full text-ocean-200 transition hover:bg-white/10 disabled:opacity-40"
              disabled={props.guests <= 1}
              type="button"
              onClick={() => props.onGuestsChange(clampGuests(props.guests - 1, props.effectiveMaxGuests))}
            >
              <Minus aria-hidden="true" size={14} />
            </button>
            <input
              id="booking-guests"
              aria-describedby={props.hasCapacityError ? 'booking-guests-error' : undefined}
              aria-invalid={props.hasCapacityError}
              className="w-10 min-w-0 border-0 bg-transparent text-center text-sm font-extrabold text-white outline-none [appearance:textfield]"
              inputMode="numeric"
              max={props.effectiveMaxGuests}
              min={1}
              type="number"
              value={props.guests}
              onChange={(event) => props.onGuestsChange(clampGuests(Number(event.target.value), props.effectiveMaxGuests))}
            />
            <button
              aria-label={language === 'es' ? 'Sumar persona' : 'Increase guests'}
              className="glass-focus-ring grid size-8 shrink-0 place-items-center rounded-full text-ocean-200 transition hover:bg-white/10 disabled:opacity-40"
              disabled={props.guests >= props.effectiveMaxGuests}
              type="button"
              onClick={() => props.onGuestsChange(clampGuests(props.guests + 1, props.effectiveMaxGuests))}
            >
              <Plus aria-hidden="true" size={14} />
            </button>
          </div>
        </Field>
      </div>

      {props.selectedTour ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.departure, language)}</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {props.availabilitySlots.map((slot) => (
              <ChoiceCard as="label" key={slot.id} className="relative flex min-h-[44px] cursor-pointer flex-col items-center justify-center py-1 pl-2.5 pr-10 text-center leading-tight has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50" disabled={slot.available === false} selected={props.timeSlotId === slot.id}>
                <input className="sr-only" type="radio" name="timeSlot" value={slot.id} checked={props.timeSlotId === slot.id} disabled={slot.available === false} onChange={() => props.onTimeSlotChange(slot.id)} />
                <ChoiceCheck selected={props.timeSlotId === slot.id} />
                <span className="text-xs font-extrabold text-white">{formatTime(slot.time)}</span>
                <span className="text-[0.6rem] font-semibold text-ocean-300">{slot.available === false ? (language === 'es' ? 'No disponible' : 'Unavailable') : slot.label}</span>
              </ChoiceCard>
            ))}
          </div>
          {!props.availabilityLoading && !props.availabilityError && !props.availabilitySlots.length ? <p className="mt-2 text-sm text-ocean-200">{language === 'es' ? 'Este paquete no tiene horas de salida disponibles.' : 'This package has no available departure times.'}</p> : null}
          {props.availabilityLoading ? <p className="mt-2 text-xs font-semibold text-ocean-300">Checking availability...</p> : null}
          {props.availabilityError ? <p className="mt-2 text-xs font-semibold text-red-200">We couldn’t load the booking information. Please try again.</p> : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function getBookingTourGroups(tours: BoatTour[], language: 'es' | 'en') {
  const groups = new Map<string, BoatTour[]>();

  tours.forEach((tour) => {
    const key = (tour.tourId ?? tour.id);
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
}) {
  const { language } = useLanguage();
  const selected = Boolean(props.selectedLocationId);
  return (
    <div className="grid gap-4 text-white">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean-500/15 text-ocean-300 sm:h-10 sm:w-10"><MapPin size={19} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{language === 'es' ? 'Lugar de salida' : 'Departure location'}</p>
          <h3 className="mt-1 text-lg font-extrabold text-white sm:text-xl">{language === 'es' ? 'Selecciona el lugar de salida' : 'Choose your departure point'}</h3>
        </div>
      </div>

      <fieldset aria-describedby={!selected ? 'departure-location-error' : undefined}>
        <legend className="sr-only">{language === 'es' ? 'Selecciona el lugar de salida' : 'Choose your departure point'}</legend>
        {props.loading ? <p className="rounded-xl border border-ocean-400/25 bg-ocean-500/10 p-3 text-sm font-semibold text-ocean-100">{language === 'es' ? 'Cargando lugares de salida...' : 'Loading departure locations...'}</p> : null}
        {props.error ? <p className="rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm font-semibold text-red-100">{language === 'es' ? 'No pudimos cargar los lugares de salida. Intenta de nuevo.' : 'We could not load departure locations. Please try again.'}</p> : null}
        {!props.loading && !props.error && props.locations.length === 0 ? (
          <p className="rounded-xl border border-ocean-400/25 bg-ocean-500/10 p-3 text-sm font-semibold text-ocean-100">{language === 'es' ? 'No hay lugares de salida disponibles.' : 'No departure locations available.'}</p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {props.locations.map((location) => {
            const isSelected = props.selectedLocationId === location.id;
            const hasSurcharge = Number(location.surcharge_amount) > 0;
            return (
              <ChoiceCard as="label" key={location.id} className="relative flex min-h-[52px] cursor-pointer flex-col justify-center gap-0.5 px-3 py-2" selected={isSelected} onClick={() => props.onLocationChange(location.id)}>
                <input className="sr-only" type="radio" name="departureLocation" value={location.id} checked={isSelected} onChange={() => props.onLocationChange(location.id)} />
                {isSelected ? <SelectedCheck /> : null}
                <span className="flex items-center justify-between gap-2 pr-6">
                  <span className="truncate text-sm font-extrabold text-white">{location.name}</span>
                  <span className="shrink-0 rounded-full border border-ocean-300/25 bg-ocean-500/10 px-2 py-0.5 text-[0.68rem] font-extrabold text-ocean-100">
                    {hasSurcharge ? `+ USD ${Number(location.surcharge_amount)}` : (language === 'es' ? 'Sin costo adicional' : 'No additional cost')}
                  </span>
                </span>
                {location.description ? <span className="truncate text-xs leading-4 text-ocean-200">{location.description}</span> : null}
              </ChoiceCard>
            );
          })}
        </div>
        {!selected ? <FieldError id="departure-location-error">{language === 'es' ? 'Selecciona un lugar de salida para continuar.' : 'Select a departure location to continue.'}</FieldError> : null}
      </fieldset>
    </div>
  );
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
  paypalInfo: string;
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
        <h3 className="mt-1 text-lg font-extrabold text-white sm:text-xl">{tr(text.booking.basicInfo, language)}</h3>
      </div>

      {/* Group A: Your details */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <Field htmlFor="booking-name" label={tr(text.booking.fullName, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-name" className="py-2.5" autoComplete="name" placeholder="John Smith" startIcon={<User size={17} />} value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} />
        </Field>
        <Field htmlFor="booking-email" label={tr(text.booking.email, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-email" className="py-2.5" autoComplete="email" placeholder="john@email.com" spellCheck={false} startIcon={<Mail size={17} />} type="email" value={props.customerEmail} onChange={(event) => props.onCustomerEmailChange(event.target.value)} />
        </Field>
      </div>

      <div className="mt-2.5">
        <Field htmlFor="booking-phone" label={tr(text.booking.phone, language)} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <Input id="booking-phone" className="py-2.5" autoComplete="tel" inputMode="tel" placeholder="+506 0000 0000" startIcon={<Phone size={17} />} type="tel" value={props.customerWhatsapp} onChange={(event) => props.onCustomerWhatsappChange(event.target.value)} />
        </Field>
      </div>

      <div className="mt-2.5">
        <Field htmlFor="booking-requests" label={language === 'es' ? 'Solicitudes especiales' : 'Special requests'} labelClassName="uppercase tracking-[0.12em] text-ocean-400">
          <TextArea id="booking-requests" className="min-h-[72px]" placeholder={language === 'es' ? 'Notas sobre comida, celebraciones o necesidades de accesibilidad...' : 'Optional meal notes, celebration details, accessibility needs...'} shape="rounded" value={props.specialRequests} onChange={(event) => props.onSpecialRequestsChange(event.target.value)} />
        </Field>
      </div>

      {props.validationMessage ? <FieldError className="mt-2.5" variant="panel">{props.validationMessage}</FieldError> : null}

      {/* Group B: Payment method */}
      <div className="mt-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Método de pago' : 'Payment method'}</p>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {props.paymentMethods.map((method) => {
            const methodCopy = getPaymentMethodCopy(method.id, language);
            const selected = props.paymentMethod === method.id;
            return (
              <ChoiceCard
                key={method.id}
                data-payment-method={method.id}
                shape="rounded"
                className="relative flex min-w-0 flex-col justify-center gap-1 p-3 text-left"
                disabled={props.isSubmitting}
                selected={selected}
                onClick={() => handlePaymentMethodAction(method.id)}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border', selected ? 'border-ocean-100 bg-ocean-100' : 'border-white/25')}>
                    {selected ? <span className="size-1.5 rounded-full bg-ocean-950" /> : null}
                  </span>
                  <span className="truncate text-[0.8rem] font-extrabold leading-tight text-white sm:text-sm">{methodCopy.title}</span>
                </span>
                <span className="truncate pl-6 text-[0.7rem] leading-4 text-ocean-200">{methodCopy.description}</span>
              </ChoiceCard>
            );
          })}
        </div>
      </div>

      {props.paypalVisible && props.booking && props.createdBooking ? (
        <div className="mt-4 rounded-2xl border border-ocean-300/30 bg-ocean-400/10 p-4 text-sm leading-6 text-ocean-100" role="status">{props.paypalInfo}</div>
      ) : null}

      {props.paypalVisible && props.booking && props.createdBooking ? (
        <PayPalCheckoutBox booking={props.booking} createdBooking={props.createdBooking} onSuccess={props.onPayPalSuccess} onError={props.onPayPalError} onCancel={props.onPayPalCancel} />
      ) : null}

      {props.paypalError ? (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-bold">{language === 'es' ? 'No se pudo completar el pago' : 'Payment could not be completed'}</p>
          <p className="mt-1">{props.paypalError}</p>
        </div>
      ) : null}

      {props.paypalSuccess && props.booking ? (
        <div className="mt-4 rounded-2xl border border-seafoam-400/30 bg-seafoam-500/10 p-4 text-ocean-50">
          <p className="text-lg font-extrabold">{language === 'es' ? 'Pago exitoso' : 'Payment Successful'}</p>
          <div className="mt-3 grid gap-2 text-sm">
            <SummaryLine label={language === 'es' ? 'Referencia de reserva' : 'Booking reference'} value={props.paypalSuccess.bookingReference} />
            <SummaryLine label={language === 'es' ? 'Monto pagado' : 'Amount paid'} value={`${props.paypalSuccess.amount} ${props.paypalSuccess.currency}`} />
            <SummaryLine label={language === 'es' ? 'Referencia de orden PayPal' : 'PayPal order reference'} value={props.paypalSuccess.orderId} />
            <SummaryLine label={language === 'es' ? 'Referencia de transacción PayPal' : 'PayPal transaction reference'} value={props.paypalSuccess.transactionId} />
            <SummaryLine label={language === 'es' ? 'Información del tour' : 'Tour information'} value={`${getTourText(props.booking.tour, language).title} - ${props.booking.packageLabel}`} />
          </div>
          <Button className="mt-4" fullWidth type="button" onClick={props.onSendPaidConfirmation}>{language === 'es' ? 'Enviar confirmación por WhatsApp' : 'Send confirmation via WhatsApp'}</Button>
        </div>
      ) : null}

      {props.isSubmitting ? <p className="mt-4 text-sm font-semibold text-ocean-300">{language === 'es' ? 'Creando solicitud de reserva...' : 'Creating booking request...'}</p> : null}

      {props.bookingStatus === 'pending_confirmation' && props.paymentStatus === 'pending' ? (
        <div className="mt-4 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">{language === 'es' ? 'Solicitud de reserva creada' : 'Booking Request Created'}</p>
          <p className="mt-1 text-sm">{language === 'es' ? 'Tu solicitud fue creada. Envía el mensaje preparado para continuar.' : 'Your booking request has been created. Send the prepared message to continue.'}</p>
        </div>
      ) : null}

      {props.bookingStatus === 'pending_confirmation' && props.paymentStatus === 'not_required_yet' ? (
        <div className="mt-4 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">{language === 'es' ? 'Solicitud de reserva recibida' : 'Booking Request Received'}</p>
          <p className="mt-1 text-sm">{language === 'es' ? 'Recibimos tu solicitud y está pendiente de confirmación.' : 'Your booking request has been received and is awaiting confirmation.'}</p>
        </div>
      ) : null}
    </div>
  );
}

function BookingPaymentSummary({ booking }: { booking: BookingPaymentPayload | null }) {
  const { language } = useLanguage();
  if (!booking) {
    return (
      <GlassPanel className="p-4 text-sm text-ocean-200" variant="subtle">
        {language === 'es' ? 'Completa la selección del tour para revisar el resumen de la reserva.' : 'Complete the tour selection to review the reservation summary.'}
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-4 text-sm" variant="subtle">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Resumen de la reserva' : 'Reservation summary'}</p>
      <div className="mt-3 grid gap-2 text-ocean-100">
        <SummaryLine label={language === 'es' ? 'Nombre' : 'Customer name'} value={booking.customerName || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Teléfono' : 'Phone'} value={booking.phone || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Correo' : 'Email'} value={booking.email || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Barco' : 'Boat'} value={booking.boat.name} />
        <SummaryLine label="Tour" value={String(getTourText(booking.tour, language).title)} />
        <SummaryLine label={language === 'es' ? 'Paquete o duración' : 'Package or duration'} value={booking.packageLabel} />
        <SummaryLine label={language === 'es' ? 'Fecha' : 'Date'} value={formatDisplayDate(booking.date)} />
        <SummaryLine label={language === 'es' ? 'Hora' : 'Time'} value={booking.time || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Número de personas' : 'Number of guests'} value={String(booking.guests)} />
        <SummaryLine label={language === 'es' ? 'Precio base del barco' : 'Boat base price'} value={formatCurrency(booking.basePrice)} />
        <SummaryLine label={language === 'es' ? 'Personas extra' : 'Additional guests'} value={String(booking.additionalGuests)} />
        <SummaryLine label={language === 'es' ? 'Cargo por persona extra' : 'Additional guest charge'} value={formatCurrency(booking.additionalGuestCharge)} />
        <SummaryLine label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={booking.departureLocationName || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Recargo de salida' : 'Departure surcharge'} value={booking.departureSurcharge > 0 ? formatCurrency(booking.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
        <SummaryLine label={language === 'es' ? 'Precio total' : 'Total price'} value={formatCurrency(booking.total)} />
        <SummaryLine label={language === 'es' ? 'Solicitudes especiales' : 'Special requests'} value={booking.specialRequests || (language === 'es' ? 'Ninguna' : 'None')} />
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
  const activeOrderIdRef = useRef<string>('');

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
          createOrder: async () => {
            const orderId = await createPayPalOrder(createdBooking.booking_id);
            activeOrderIdRef.current = orderId;
            return orderId;
          },
          onApprove: async (data) => {
            const result = await capturePayPalOrder(data.orderID, createdBooking.booking_id, createdBooking.booking_reference);
            callbacksRef.current.onSuccess(result);
          },
          onCancel: () => {
            void cancelPayPalOrder(createdBooking.booking_id, activeOrderIdRef.current).catch(() => undefined);
            callbacksRef.current.onCancel();
          },
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

/** The one persistent reservation summary (rule D) — same component, same
 * props shape, used both open-and-sticky on desktop and inside the mobile
 * collapsible wrapper. Shows every row progressively with "Not selected"
 * placeholders rather than hiding them, and only reveals the payment method
 * once the flow has reached step 4. */
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
  currentStep: number;
}) {
  const { language } = useLanguage();
  const coverImage = props.selectedBoat.image;
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : tr(text.booking.selectTour, language);
  const subtotal = props.selectedTour?.customQuote ? (language === 'es' ? 'Cotización personalizada' : 'Custom quote') : formatCurrency(props.pricing.basePrice);
  const extrasTotal = props.selectedTour?.customQuote ? '-' : formatCurrency(Math.max(props.pricing.total - props.pricing.basePrice - props.pricing.extraGuestsTotal - props.pricing.departureSurcharge, 0));

  return (
    <GlassPanel as="aside" className="h-fit p-2.5" variant="surface">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean-400">{tr(text.booking.summary, language)}</p>
      <img src={coverImage} alt={props.selectedBoat.name} className="mt-1.5 hidden aspect-[16/6] w-full rounded-lg object-cover min-[400px]:block" loading="lazy" />
      <div className="mt-1.5">
        <h3 className="text-sm font-extrabold text-white sm:text-base">{props.selectedBoat.name}</h3>
        <p className="mt-0.5 text-xs font-semibold text-ocean-300">{props.selectedBoat.length} - {props.selectedBoat.engine}</p>
      </div>
      <div className="mt-2 grid gap-0.5 text-xs text-ocean-100">
        <SummaryRow label={tr(text.booking.tourType, language)} value={props.selectedTour ? `${selectedTourName}${props.selectedTour.duration ? ` (${props.selectedTour.duration}h)` : ''}` : tr(text.booking.selectTour, language)} />
        <SummaryRow label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
        <SummaryRow label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot ? formatTime(props.selectedTimeSlot.time) : tr(text.booking.selectTime, language)} />
        <SummaryRow label={tr(text.booking.guests, language)} value={`${props.guests} ${tr(text.booking.people, language)}`} />
        {Boolean(props.selectedTour?.mealOptions?.length) ? <SummaryRow label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
        <SummaryRow label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={props.departureLocation?.name ?? (language === 'es' ? 'No seleccionado' : 'Not selected')} />
        {props.currentStep >= 3 ? <SummaryRow label={language === 'es' ? 'Método de pago' : 'Payment method'} value={props.selectedPayment} /> : null}
      </div>
      <GlassPanel className="mt-2 p-2 text-xs" variant="subtle">
        <SummaryRow label={language === 'es' ? 'Precio base' : 'Base price'} value={subtotal} />
        <SummaryRow label={language === 'es' ? 'Incluye hasta' : 'Includes up to'} value={`${getTourIncludedGuests(props.selectedBoat, props.selectedTour)} ${language === 'es' ? 'personas' : 'guests'}`} />
        {props.pricing.extraGuests > 0 ? <SummaryRow label={tr(text.booking.extraPeople, language)} value={`${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)}`} /> : null}
        <SummaryRow label={language === 'es' ? 'Cargo por salida' : 'Departure surcharge'} value={props.pricing.departureSurcharge > 0 ? formatCurrency(props.pricing.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
        <SummaryRow label={tr(text.booking.taxes, language)} value={extrasTotal} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-2">
          <span className="text-sm font-extrabold text-white">Total</span>
          <span className="text-lg font-extrabold text-ocean-100">{props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total)}</span>
        </div>
      </GlassPanel>
    </GlassPanel>
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
          {Boolean(props.selectedTour?.mealOptions?.length) ? <SummaryLine label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
          <SummaryLine label={language === 'es' ? 'Cargos por personas extra' : 'Additional guest charges'} value={props.pricing.extraGuests > 0 ? `${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : '$0'} />
          <SummaryLine label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={props.departureLocation?.name ?? '-'} />
          <SummaryLine label={language === 'es' ? 'Cargo por salida' : 'Departure surcharge'} value={props.pricing.departureSurcharge > 0 ? formatCurrency(props.pricing.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
          <SummaryLine label="Total" value={props.pricing.isCustomQuote ? (language === 'es' ? 'Cotización personalizada' : 'Custom quote') : formatCurrency(props.pricing.total)} />
          <SummaryLine label={language === 'es' ? 'Nombre' : 'Customer name'} value={props.customerName} />
          <SummaryLine label={language === 'es' ? 'Correo' : 'Email'} value={props.customerEmail} />
          <SummaryLine label={language === 'es' ? 'Numero de WhatsApp' : 'WhatsApp number'} value={props.customerWhatsapp} />
          <SummaryLine label={language === 'es' ? 'Solicitudes especiales' : 'Special requests'} value={props.specialRequests || (language === 'es' ? 'Ninguna' : 'None')} />
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
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-white/10 pb-0.5 last:border-b-0 last:pb-0">
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
  if (!value) return 'Select a date';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}
