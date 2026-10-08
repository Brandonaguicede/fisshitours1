import { ArrowLeft, ArrowRight, Check, CreditCard, Info, Mail, MapPin, Minus, MessageCircle, Phone, Plus, Ship, User } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getBoatText, getIncludedItems, getPackageLabel, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { MOCK_TURNSTILE_TOKEN, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { cancelPayPalOrder, capturePayPalOrder, createPayPalOrder, getPayPalErrorMessage, loadPayPalSdk, type PayPalCaptureResult } from '../../services/paypalService';
import { AvailabilityError, getBookingAvailability, type AvailabilitySlot } from '../../services/availabilityService';
import { calculateBookingPrice, createBooking, getActiveDepartureLocations, type BookingResult, type DepartureLocation, type PriceResult } from '../../services/bookingService';
import { getActivePaymentMethods } from '../../services/paymentService';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { buildBookingPaymentPayload, createWhatsAppBookingMessage, getWhatsAppBookingUrl, type BookingPaymentMethod, type BookingStatus, type BookingPaymentPayload, type PaymentStatus } from '../../utils/bookingPayment';
import { calculateBookingTotal, getBoatStartingPrice, getEffectiveMaxGuests, getExtraGuestPrice, getTourIncludedGuests } from '../../utils/bookingPricing';
import { isBookableCatalogPackage } from '../../utils/tourCatalog';
import { filterPackageSlots } from '../../utils/packageSettings';
import { cn } from '../../utils/cn';
import { getDefaultDepartureLocation } from '../../utils/departureLocations';
import { formatTime, sortSlotsChronologically } from '../../utils/format';
import { Button, ChoiceCard, Field, FieldError, GlassPanel, Input, ModalShell, TextArea } from '../ui';
import { CURRENT_TERMS_VERSION } from '../../../supabase/functions/_shared/terms.mjs';
import { TermsConsent } from './TermsModal';

function formatCurrency(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : '\u2026';
}

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

// `type` is what actually has a working checkout integration below
// (handlePaymentMethodAction dispatches on it) — a payment_methods row with
// any other `type` (e.g. bank_transfer, sinpe, cash, manual — all valid per
// the DB's own CHECK constraint) has no real handler yet, so it's filtered
// out rather than rendered as a card that does nothing when clicked.
type SupportedPaymentType = 'paypal' | 'whatsapp_link';
const SUPPORTED_PAYMENT_TYPES: SupportedPaymentType[] = ['paypal', 'whatsapp_link'];

const paymentMethods: Array<{ id: BookingPaymentMethod; type: SupportedPaymentType; title: string; description: string; icon: typeof CreditCard; logo?: string; logoAlt?: string }> = [
  { id: 'paypal', type: 'paypal', title: 'Pay with PayPal', description: 'Secure USD checkout.', icon: CreditCard, logo: '/images/paypal.png', logoAlt: 'PayPal' },
  { id: 'whatsapp-link', type: 'whatsapp_link', title: 'Request Payment Link via WhatsApp', description: 'Request a payment link.', icon: MessageCircle, logo: '/images/whatsapp.png', logoAlt: 'WhatsApp' },
];

// Spanish copy for the known integrations, keyed by `type` (not `key`/`id`)
// so it survives an admin renaming a method's name or key. `payment_methods`
// only stores one (English) name/description, so this is the only source of
// Spanish text for these — a method with a custom name still gets an
// accurate Spanish label for what kind of checkout it actually is.
const SPANISH_COPY_BY_TYPE: Record<SupportedPaymentType, { title: string; description: string }> = {
  paypal: { title: 'Pagar con PayPal', description: 'Checkout seguro en USD.' },
  whatsapp_link: { title: 'Solicitar enlace por WhatsApp', description: 'Solicita un enlace de pago.' },
};

function getPaymentMethodCopy(method: { title: string; description: string; type: SupportedPaymentType }, language: 'es' | 'en') {
  if (language === 'en') return method;
  return { ...method, ...SPANISH_COPY_BY_TYPE[method.type] };
}

export function BookingPanel({ selectedBoat, selectedTour: requestedTour, boats, tours, catalogLoading, selectedTimeSlotId, onBoatChange, onTourChange }: BookingPanelProps) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const selectedTour = tours.find((item) => item.id === requestedTour?.id && item.boatId === selectedBoat.id
    && item.tourId === requestedTour?.tourId && item.boatTourId === requestedTour?.boatTourId
    && item.boatTourId && item.tourId && item.catalogActive === true && isBookableCatalogPackage(item));
  const selectionReady = !catalogLoading && Boolean(selectedTour && boats.some((boat) => boat.id === selectedBoat.id));
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
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('pending');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [validationMessage, setValidationMessage] = useState('');
  // Terms and Conditions: the payment methods stay logically locked (aria-disabled) until accepted, because choosing one is what creates the booking.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [paypalVisible, setPaypalVisible] = useState(false);
  const [paypalError, setPaypalError] = useState('');
  const [paypalInfo, setPaypalInfo] = useState('');
  const [paypalSuccess, setPaypalSuccess] = useState<PayPalCaptureResult | null>(null);
  const [successNotice, setSuccessNotice] = useState<{ title: string; message: string; reference?: string; whatsappUrl?: string } | null>(null);
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
    setValidationMessage('');
    setActiveStep(selectedTour ? 1 : 0);
  }, [parentIdentity, selectedBoat, selectedTour]);

  const availableTours = useMemo(() => tours.filter((tour) => tour.boatId === selectedBoat.id && isBookableCatalogPackage(tour)), [selectedBoat.id, tours]);
  const availabilityQuery = useQuery({
    queryKey: ['availability', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, date, selectedTour?.boatTourId],
    queryFn: ({ signal }) => getBookingAvailability(selectedBoat.id, selectedTour!.tourId!, selectedTour!.id, date, signal),
    enabled: selectionReady && Boolean(date),
    // A package that cannot be booked will not fix itself in a few seconds: answer at once. Real network / backend failures keep the default retries.
    retry: (failureCount, error) => !(error instanceof AvailabilityError && error.kind === 'package_unavailable') && failureCount < 3,
  });
  // Internal diagnosis only (the customer just sees the friendly message): which package / link / requirement could not be booked.
  const loggedPackageProblem = useRef('');
  useEffect(() => {
    const error = availabilityQuery.error;
    if (!(error instanceof AvailabilityError) || error.kind !== 'package_unavailable' || !selectedTour) return;
    const marker = `${selectedTour.id}|${selectedTour.boatTourId}`;
    if (loggedPackageProblem.current === marker) return;
    loggedPackageProblem.current = marker;
    console.warn('[booking] package cannot be booked', { operation: 'get-booking-availability', packageId: selectedTour.id, boatTourId: selectedTour.boatTourId, boatId: selectedBoat.id, tourId: selectedTour.tourId, status: error.status, reason: error.message });
  }, [availabilityQuery.error, selectedBoat.id, selectedTour]);
  const paymentMethodsQuery = useQuery({ queryKey: ['paymentMethods', 'active'], queryFn: getActivePaymentMethods });
  const departureLocationsQuery = useQuery({ queryKey: ['departureLocations', 'active'], queryFn: getActiveDepartureLocations });
  const departureLocations = departureLocationsQuery.data ?? [];
  const selectedDepartureLocation = departureLocations.find((location) => location.id === departureLocationId);
  const remotePaymentMethods = paymentMethodsQuery.data
    // A row with no usable `key` can't be safely persisted as
    // payment_method_key later — exclude it rather than silently falling
    // back to some other key at submit time (see submitBooking).
    ?.filter((method): method is typeof method & { type: SupportedPaymentType } => Boolean(method.key) && SUPPORTED_PAYMENT_TYPES.includes(method.type as SupportedPaymentType))
    .map((method) => ({
      id: method.key as BookingPaymentMethod,
      type: method.type,
      title: method.name,
      // ES: description_es -> description (legacy) -> description_en · EN: description_en -> description (legacy) -> description_es
      description: language === 'en'
        ? method.description_en || method.description || method.description_es || ''
        : method.description_es || method.description || method.description_en || '',
      icon: method.type === 'paypal' ? CreditCard : MessageCircle,
      logo: method.logo_url ?? undefined,
      logoAlt: method.name,
    }));
  const backendPaymentMethods = remotePaymentMethods?.length ? remotePaymentMethods : paymentMethods;
  const priceQuery = useQuery({
    queryKey: ['bookingPrice', selectedBoat.id, selectedTour?.tourId, selectedTour?.id, guests, selectedDepartureLocation?.id, selectedTour?.boatTourId],
    queryFn: ({ signal }) => calculateBookingPrice({
      boatId: selectedBoat.id,
      tourId: selectedTour?.tourId ?? '',
      boatTourId: selectedTour?.boatTourId,
      tourPackageId: selectedTour?.id ?? '',
      guests,
      departureLocationId: selectedDepartureLocation?.id,
      extras: [],
    }, signal),
    enabled: selectionReady && guests > 0 && departureLocationsQuery.isSuccess && !departureLocationsQuery.isFetching && (!departureLocationId || Boolean(selectedDepartureLocation)),
    staleTime: 250,
  });
  const quotedPricing = mapBackendPricing(selectedBoat, selectedTour, guests, selectedDepartureLocation, priceQuery.data);
  // Once created, the saved snapshots are the same amounts PayPal and email read.
  const pricing = createdBooking && createdBooking.tour_package_id === selectedTour?.id
    && createdBooking.guests === guests && createdBooking.tour_date === date && createdBooking.time_slot_id === timeSlotId
    && createdBooking.departure_location_id === selectedDepartureLocation?.id
    ? { ...quotedPricing, basePrice: Number(createdBooking.base_price_snapshot),
        extraGuests: Number(createdBooking.extra_guests_snapshot), extraGuestsTotal: Number(createdBooking.extra_guests_total_snapshot),
        extrasTotal: Number(createdBooking.extras_total_snapshot), departureSurcharge: Number(createdBooking.departure_surcharge_snapshot ?? 0),
        taxRate: Number(createdBooking.tax_rate_snapshot), taxAmount: Number(createdBooking.tax_amount_snapshot),
        total: Number(createdBooking.total_snapshot) }
    : quotedPricing;
  const effectiveMaxGuests = priceQuery.data?.max_guests ?? getEffectiveMaxGuests(selectedBoat, selectedTour);
  const includedGuests = priceQuery.data?.included_guests ?? getTourIncludedGuests(selectedBoat, selectedTour);
  const extraGuestPrice = priceQuery.data?.extra_guest_price ?? getExtraGuestPrice(selectedBoat, selectedTour);
  const currentSlots = useMemo(() => filterPackageSlots(selectedTour, availabilityQuery.data ?? (selectedTour?.timeSlots ?? []).map((slot) => ({ ...slot, available: true }))), [selectedTour, availabilityQuery.data]);
  const selectedTimeSlot = currentSlots.find((slot) => slot.id === timeSlotId);
  const selectedPayment = backendPaymentMethods.find((method) => method.id === paymentMethod) ?? backendPaymentMethods[0];
  const steps = [tr(text.booking.steps.boat, language), tr(text.booking.steps.tour, language), language === 'es' ? 'Lugar de salida' : 'Departure location', language === 'es' ? 'Tus datos y pago' : 'Your details and payment'];
  const hasCapacityError = guests > effectiveMaxGuests;
  const canContinueToCustomer = Boolean(selectionReady && selectedTimeSlot && !hasCapacityError && priceQuery.data && !priceQuery.isFetching && !priceQuery.isError && availabilityQuery.data && !availabilityQuery.isError && !availabilityQuery.isFetching && selectedTimeSlot.available !== false);
  const hasTurnstileToken = USE_LOCAL_TURNSTILE_MOCK || Boolean(turnstileToken);
  const canContinueToPayment = Boolean(canContinueToCustomer && selectedDepartureLocation);
  const canReview = Boolean(canContinueToPayment && customerName.trim() && customerEmail.trim() && customerWhatsapp.trim() && isValidEmail(customerEmail) && hasTurnstileToken);
  const bookingPayload = selectionReady && selectedTour
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
        language,
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
    if (!departureLocationsQuery.isSuccess || departureLocationsQuery.isFetching) return;
    if (departureLocationId && !departureLocations.some((location) => location.id === departureLocationId)) {
      setDepartureLocationId('');
      return;
    }
    if (departureLocationId || !departureLocations.length) return;
    // Position 1 (sort_order) is the default; the legacy is_default flag no longer decides.
    const defaultLocation = getDefaultDepartureLocation(departureLocations);
    if (defaultLocation) setDepartureLocationId(defaultLocation.id);
  }, [departureLocationId, departureLocations, departureLocationsQuery.isSuccess, departureLocationsQuery.isFetching]);

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
    if (!selectionReady || priceQuery.isFetching || priceQuery.isError || !priceQuery.data || availabilityQuery.isFetching || availabilityQuery.isError || !availabilityQuery.data || departureLocationsQuery.isFetching || departureLocationsQuery.isError) {
      setValidationMessage(language === 'es' ? 'Espera a que se verifiquen las opciones de reserva.' : 'Please wait for booking options to be verified.');
      return null;
    }
    if (!selectedTour) {
      setActiveStep(1);
      setValidationMessage(language === 'es' ? 'Selecciona un tour.' : 'Please select a tour.');
      return null;
    }
    if (!selectedTimeSlot) {
      setActiveStep(1);
      setValidationMessage(language === 'es' ? 'Selecciona una hora de salida.' : 'Please select a departure time.');
      return null;
    }
    if (!date) {
      setActiveStep(1);
      setValidationMessage(language === 'es' ? 'Selecciona una fecha.' : 'Please select a date.');
      return null;
    }
    if (guests < 1 || guests > effectiveMaxGuests) {
      setActiveStep(1);
      setValidationMessage(language === 'es' ? `Selecciona entre 1 y ${effectiveMaxGuests} personas.` : `Please select between 1 and ${effectiveMaxGuests} guests.`);
      return null;
    }
    if (!selectedDepartureLocation) {
      setActiveStep(2);
      setValidationMessage(language === 'es' ? 'Selecciona un lugar de salida.' : 'Please select a departure location.');
      return null;
    }
    if (!customerName.trim()) {
      setActiveStep(3);
      setValidationMessage(language === 'es' ? 'Ingresa el nombre del cliente.' : 'Please enter the customer name.');
      return null;
    }
    if (!customerWhatsapp.trim()) {
      setActiveStep(3);
      setValidationMessage(language === 'es' ? 'Ingresa el número de teléfono.' : 'Please enter the phone number.');
      return null;
    }
    if (!isValidEmail(customerEmail)) {
      setActiveStep(3);
      setValidationMessage(language === 'es' ? 'Ingresa un correo electrónico válido.' : 'Please enter a valid email.');
      return null;
    }
    if (pricing.isCustomQuote || pricing.total <= 0 || !bookingPayload) {
      setActiveStep(1);
      setValidationMessage(language === 'es' ? 'Selecciona un paquete de tour con precio.' : 'Please select a priced tour package.');
      return null;
    }
    if (!termsAccepted) {
      setActiveStep(3);
      setTermsError(true);
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
      setValidationMessage(error.message || (language === 'es' ? 'No pudimos crear la reserva. Inténtalo de nuevo.' : 'We couldn’t create the booking. Please try again.'));
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
      departureLocationId: selectedDepartureLocation!.id,
      mealOption: mealOption || undefined,
      specialRequests: specialRequests || undefined,
      paymentMethodKey: method,
      extras: [],
      turnstileToken: USE_LOCAL_TURNSTILE_MOCK ? MOCK_TURNSTILE_TOKEN : turnstileToken,
      language,
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    setTurnstileToken('');
    setTurnstileResetKey((value) => value + 1);
    return result;
  }

  function openWhatsAppBooking(booking: BookingPaymentPayload, variant: 'payment_link' | 'paid_confirmation') {
    const url = getWhatsAppBookingUrl(createWhatsAppBookingMessage(booking, variant, language));
    window.location.assign(url);
  }

  function handlePaymentLinkRequest(key: BookingPaymentMethod) {
    submitBooking(key).then((result) => {
      if (!result || !bookingPayload) return;
      setPaymentMethod(key);
      setBookingStatus('pending_confirmation');
      setPaymentStatus('pending');
      setPaypalVisible(false);
      setSuccessNotice(null);
      const whatsappUrl = getWhatsAppBookingUrl(createWhatsAppBookingMessage({ ...bookingPayload, bookingReference: result.booking_reference, basePrice: result.base_price_snapshot, taxRate: result.tax_rate_snapshot, taxAmount: result.tax_amount_snapshot, additionalGuestCharge: result.extra_guests_total_snapshot, extrasTotal: result.extras_total_snapshot, departureSurcharge: Number(result.departure_surcharge_snapshot ?? 0), total: result.total_snapshot, paymentMethod: language === 'es' ? 'Enlace de pago por WhatsApp' : 'WhatsApp payment link', paymentStatus: 'pending' }, 'payment_link', language));
      setSuccessNotice({
        title: language === 'es' ? 'Reserva creada' : 'Booking created',
        message: language === 'es' ? 'Recibimos tu reserva. Abre WhatsApp para solicitar el enlace de pago.' : 'We received your booking. Open WhatsApp to request the payment link.',
        reference: result.booking_reference,
        whatsappUrl,
      });
      window.location.assign(whatsappUrl);
    }).catch((error: unknown) => {
      setValidationMessage(error instanceof Error ? error.message : (language === 'es' ? 'No se pudo abrir WhatsApp. Intenta nuevamente.' : 'Unable to open WhatsApp. Please try again.'));
    });
  }

  function handlePayPalRequest(key: BookingPaymentMethod) {
    const booking = validateBookingForPayment();
    if (!booking) return;
    submitBooking(key).then(() => {
      setPaymentMethod(key);
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
                includedGuests={includedGuests}
                extraGuestPrice={extraGuestPrice}
                availabilitySlots={currentSlots}
                availabilityLoading={availabilityQuery.isFetching}
                availabilityError={availabilityQuery.isError}
                availabilityPackageUnavailable={availabilityQuery.error instanceof AvailabilityError && availabilityQuery.error.kind === 'package_unavailable'}
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
                termsAccepted={termsAccepted}
                termsError={termsError}
                onTermsAcceptedChange={(accepted) => { setTermsAccepted(accepted); if (accepted) setTermsError(false); }}
                onTermsRequired={() => setTermsError(true)}
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
                onPayPalSuccess={(result) => {
                  setPaypalError('');
                  setPaypalInfo('');
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
                  setPaypalError('');
                  setPaypalInfo(language === 'es'
                    ? 'La ventana de PayPal se cerró sin completar el pago. Puedes volver a intentarlo con el botón de PayPal o elegir otro método de pago.'
                    : 'The PayPal window closed without completing payment. You can try again using the PayPal button or choose another payment method.');
                  setBookingStatus('pending_payment');
                  setPaymentStatus('pending');
                }}
                onPayPalStart={() => {
                  setPaypalError('');
                  setPaypalInfo('');
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
          const boatText = getBoatText(boat, language);
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
                {boatText.featuredSpec ? <span className="block truncate text-[0.7rem] leading-4 text-ocean-400">{boatText.featuredSpec}</span> : null}
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
  includedGuests: number;
  extraGuestPrice: number;
  availabilitySlots: Array<{ id: string; label: string; time: string; available?: boolean }>;
  availabilityLoading: boolean;
  availabilityError: boolean;
  /** The package itself cannot be booked (not a network / backend hiccup): show the friendly "choose another" message. */
  availabilityPackageUnavailable: boolean;
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
  const extraGuests = Math.max(0, props.guests - props.includedGuests);
  const showExtraGuestNotice = Boolean(props.selectedTour && !props.selectedTour.customQuote && extraGuests > 0 && props.extraGuestPrice > 0);
  const includedItems = props.selectedTour ? getIncludedItems(props.selectedTour, language) : [];
  const capacityMessage = props.hasCapacityError ? (language === 'es' ? `Este barco tiene capacidad maxima de ${props.effectiveMaxGuests} personas.` : `This boat has a maximum capacity of ${props.effectiveMaxGuests} guests.`) : undefined;
  // Presentation only: chronological order whatever the order stored in the database / Admin. Ids, availability and the selection
  // are untouched (the selected slot keeps its id, so it stays selected after the sort).
  const orderedSlots = sortSlotsChronologically(props.availabilitySlots);

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

      {includedItems.length > 0 ? (
        <section aria-labelledby="booking-included-title">
          <h4 id="booking-included-title" className="text-sm font-bold text-ocean-100">{tr(text.booking.included, language)}</h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {includedItems.map((item, index) => (
              <li key={`${index}-${item}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold leading-4 text-ocean-100">
                <Check aria-hidden="true" className="shrink-0 text-ocean-400" size={12} />
                {item}
              </li>
            ))}
          </ul>
        </section>
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

      {/* Date and Guests are one family: same height (h-11), radius (rounded-xl), border and background. On desktop they are only as
          wide as their content needs (the rest of the row stays empty); on a phone they share the row and grow with the width. */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <Field className="min-w-[9.5rem] flex-1 sm:min-w-0 sm:w-48 sm:flex-none" htmlFor="booking-date" label={tr(text.booking.date, language)} labelClassName="text-sm font-bold">
            <Input id="booking-date" className="h-11 min-w-0 max-w-full appearance-none px-3 py-0 text-sm tracking-tight" tone="ocean" type="date" value={props.date} onChange={(event) => props.onDateChange(event.target.value)} />
          </Field>
          <Field className="min-w-[9.5rem] flex-1 sm:min-w-0 sm:w-36 sm:flex-none" htmlFor="booking-guests" label={tr(text.booking.guests, language)} labelClassName="text-sm font-bold">
            <div className={`flex h-11 items-center justify-between rounded-xl border bg-ocean-900/70 px-1.5 ${props.hasCapacityError ? 'border-red-300/50' : 'border-white/10'}`} data-testid="guests-stepper">
              <button
                aria-label={language === 'es' ? 'Restar persona' : 'Decrease guests'}
                className="glass-focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-ocean-200 transition hover:bg-white/10 disabled:opacity-40"
                disabled={props.guests <= 1}
                type="button"
                onClick={() => props.onGuestsChange(clampGuests(props.guests - 1, props.effectiveMaxGuests))}
              >
                <Minus aria-hidden="true" size={14} />
              </button>
              <input
                id="booking-guests"
                aria-describedby={[props.hasCapacityError ? 'booking-guests-error' : '', showExtraGuestNotice ? 'booking-guests-extra' : ''].filter(Boolean).join(' ') || undefined}
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
                className="glass-focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-ocean-200 transition hover:bg-white/10 disabled:opacity-40"
                disabled={props.guests >= props.effectiveMaxGuests}
                type="button"
                onClick={() => props.onGuestsChange(clampGuests(props.guests + 1, props.effectiveMaxGuests))}
              >
                <Plus aria-hidden="true" size={14} />
              </button>
            </div>
          </Field>
        </div>
        {/* Messages live below the row, at full width, so the compact controls above never squeeze them. */}
        {capacityMessage ? <FieldError id="booking-guests-error">{capacityMessage}</FieldError> : null}
        <div role="status" aria-live="polite" aria-atomic="true">
          {showExtraGuestNotice ? (
            <p id="booking-guests-extra" className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
              <Info aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
              <span>
                {language === 'es'
                  ? `El paquete incluye ${props.includedGuests} personas. ${extraGuests} ${extraGuests === 1 ? 'persona extra' : 'personas extra'} × ${formatCurrency(props.extraGuestPrice)}: `
                  : `This package includes ${props.includedGuests} guests. ${extraGuests} additional ${extraGuests === 1 ? 'guest' : 'guests'} × ${formatCurrency(props.extraGuestPrice)}: `}
                <strong>+{formatCurrency(extraGuests * props.extraGuestPrice)}</strong>
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {props.selectedTour ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.departure, language)}</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {orderedSlots.map((slot) => (
              <ChoiceCard as="label" key={slot.id} className="relative flex min-h-[44px] cursor-pointer flex-col items-center justify-center py-1 pl-2.5 pr-10 text-center leading-tight has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50" disabled={slot.available === false} selected={props.timeSlotId === slot.id}>
                <input className="sr-only" type="radio" name="timeSlot" value={slot.id} checked={props.timeSlotId === slot.id} disabled={slot.available === false} onChange={() => props.onTimeSlotChange(slot.id)} />
                <ChoiceCheck selected={props.timeSlotId === slot.id} />
                <span className="text-xs font-extrabold text-white">{formatTime(slot.time)}</span>
                <span className="text-[0.6rem] font-semibold text-ocean-300">{slot.available === false ? (language === 'es' ? 'No disponible' : 'Unavailable') : slot.label}</span>
              </ChoiceCard>
            ))}
          </div>
          {!props.availabilityLoading && !props.availabilityError && !props.availabilitySlots.length ? <p className="mt-2 text-sm text-ocean-200">{language === 'es' ? 'Este paquete no tiene horas de salida disponibles.' : 'This package has no available departure times.'}</p> : null}
          {props.availabilityLoading ? <p className="mt-2 text-xs font-semibold text-ocean-300">{language === 'es' ? 'Verificando disponibilidad...' : 'Checking availability...'}</p> : null}
          {props.availabilityError && props.availabilityPackageUnavailable ? <p className="mt-2 text-sm font-semibold text-amber-200" role="status">{tr(text.booking.packageUnavailable, language)}</p> : null}
          {props.availabilityError && !props.availabilityPackageUnavailable ? <p className="mt-2 text-xs font-semibold text-red-200">{language === 'es' ? 'No pudimos cargar la información de la reserva. Inténtalo de nuevo.' : 'We couldn’t load the booking information. Please try again.'}</p> : null}
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
      taxAmount: 0,
      taxRate: 0,
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
    taxAmount: Number(price.tax_amount ?? 0),
    taxRate: Number(price.tax_rate ?? 0),
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
            // ES: description_es -> description (legacy) -> description_en · EN: description_en -> description (legacy) -> description_es
            const locationDescription = language === 'en'
              ? location.description_en || location.description || location.description_es
              : location.description_es || location.description || location.description_en;
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
                {locationDescription ? <span className="truncate text-xs leading-4 text-ocean-200">{locationDescription}</span> : null}
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
  termsAccepted: boolean;
  termsError: boolean;
  onTermsAcceptedChange: (accepted: boolean) => void;
  onTermsRequired: () => void;
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
  // Take the selected row's real key as a parameter rather than reading
  // `paymentMethod` state inside the handler: `onPaymentMethodChange` above
  // schedules a state update that hasn't committed yet when these run in the
  // same click, so a handler reading state here would see the *previous*
  // render's value, not the one just selected (classic stale-closure trap).
  onPayPalRequest: (key: BookingPaymentMethod) => void;
  onPaymentLinkRequest: (key: BookingPaymentMethod) => void;
  onPayPalSuccess: (result: PayPalCaptureResult) => void;
  onPayPalError: (message: string) => void;
  onPayPalCancel: () => void;
  onPayPalStart: () => void;
  onSendPaidConfirmation: () => void;
}) {
  const { language } = useLanguage();

  function handlePaymentMethodAction(method: BookingPaymentMethod, type: SupportedPaymentType) {
    if (props.isSubmitting) return;
    // Not a real `disabled` (that would swallow the click and the feedback): the method is aria-disabled and answers with an inline message.
    if (!props.termsAccepted) {
      props.onTermsRequired();
      return;
    }
    // `key` (`method`) is what gets persisted as payment_method_key — real,
    // schema-backed identity of the exact row the customer picked. `type`
    // only decides which integration to run; two rows can share a `type`
    // (e.g. a second PayPal-style method) and must still be told apart here.
    // A row with no usable key never makes it into props.paymentMethods (see
    // remotePaymentMethods' filter in the parent), so `method` is always a
    // real, non-empty key by the time this runs.
    props.onPaymentMethodChange(method);
    if (type === 'paypal') props.onPayPalRequest(method);
    if (type === 'whatsapp_link') props.onPaymentLinkRequest(method);
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

      {/* Terms and Conditions: right above the payment methods, once the customer already saw tour, price, IVA and total. */}
      <TermsConsent className="mt-5" checked={props.termsAccepted} onChange={props.onTermsAcceptedChange} showError={props.termsError} language={language} />

      {/* Group B: Payment method */}
      <div className="mt-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Método de pago' : 'Payment method'}</p>
        {/* Columns follow the number of methods actually rendered (never a fixed empty third column). Classes are spelled out so Tailwind keeps them. */}
        <div className={cn('mt-2.5 grid grid-cols-1 gap-2', props.paymentMethods.length <= 1 ? 'sm:grid-cols-1' : props.paymentMethods.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')} data-payment-methods-grid>
          {props.paymentMethods.map((method) => {
            const methodCopy = getPaymentMethodCopy(method, language);
            const selected = props.paymentMethod === method.id;
            return (
              <ChoiceCard
                key={method.id}
                data-payment-method={method.id}
                shape="rounded"
                className={cn('relative flex min-w-0 flex-col justify-center gap-1 p-3 text-left', !props.termsAccepted && 'opacity-60')}
                aria-disabled={!props.termsAccepted || undefined}
                disabled={props.isSubmitting}
                selected={selected}
                onClick={() => handlePaymentMethodAction(method.id, method.type)}
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

      {props.paypalVisible && props.booking && props.createdBooking && props.paypalInfo ? (
        <div className="mt-4 rounded-2xl border border-ocean-300/30 bg-ocean-400/10 p-4 text-sm leading-6 text-ocean-100" role="status">{props.paypalInfo}</div>
      ) : null}

      {props.paypalVisible && props.booking && props.createdBooking ? (
        <PayPalCheckoutBox booking={props.booking} createdBooking={props.createdBooking} onSuccess={props.onPayPalSuccess} onError={props.onPayPalError} onCancel={props.onPayPalCancel} onStart={props.onPayPalStart} language={language} />
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
        <SummaryLine label={language === 'es' ? 'Precio base del barco' : 'Package Price'} value={formatCurrency(booking.basePrice)} />
        <SummaryLine label={language === 'es' ? 'Personas extra' : 'Additional guests'} value={String(booking.additionalGuests)} />
        <SummaryLine label={language === 'es' ? 'Cargo por persona extra' : 'Additional guest charge'} value={formatCurrency(booking.additionalGuestCharge)} />
        <SummaryLine label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={booking.departureLocationName || (language === 'es' ? 'Requerido' : 'Required')} />
        <SummaryLine label={language === 'es' ? 'Recargo de salida' : 'Departure surcharge'} value={booking.departureSurcharge > 0 ? formatCurrency(booking.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
        <SummaryLine label={`IVA (${Math.round(booking.taxRate * 100)}%)`} value={formatCurrency(booking.taxAmount)} />
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
  onStart: () => void;
  language?: 'es' | 'en';
}) {
  // `language` is passed in (not read via useLanguage) so this box stays a
  // plain function of its props — tests/paypal-checkout-lifecycle.test.mjs
  // runs its source with hook doubles and no i18n context.
  const { createdBooking, onSuccess, onError, onCancel, onStart, language = 'en' } = props;
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const containerId = `paypal-button-container-${createdBooking.booking_id}`;
  const callbacksRef = useRef({ onSuccess, onError, onCancel, onStart });
  const activeOrderIdRef = useRef<string>('');

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, onCancel, onStart };
  }, [onSuccess, onError, onCancel, onStart]);

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
    let buttons: ReturnType<NonNullable<Window['paypal']>['Buttons']> | undefined;
    let approved = false;
    let cancellation: Promise<unknown> = Promise.resolve();
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    if (!clientId) {
      callbacksRef.current.onError(language === 'es' ? 'PayPal no está configurado. Define VITE_PAYPAL_CLIENT_ID para habilitar el checkout de prueba.' : 'PayPal is not configured. Set VITE_PAYPAL_CLIENT_ID to enable sandbox checkout.');
      return;
    }

    if (clientId === 'mock') {
      createPayPalOrder(createdBooking.booking_id)
        .then((orderId) => capturePayPalOrder(orderId, createdBooking.booking_id, createdBooking.booking_reference))
        .then((result) => {
          if (isMounted) callbacksRef.current.onSuccess(result);
        })
        .catch((error: Error) => { if (isMounted) callbacksRef.current.onError(error.message); });
      return () => { isMounted = false; };
    }

    loadPayPalSdk(clientId)
      .then(() => {
        if (!isMounted || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: buttonStyle,
          createOrder: async () => {
            callbacksRef.current.onStart();
            await cancellation;
            approved = false;
            activeOrderIdRef.current = '';
            const orderId = await createPayPalOrder(createdBooking.booking_id);
            activeOrderIdRef.current = orderId;
            return orderId;
          },
          onApprove: async (data) => {
            if (!isMounted) return;
            approved = true;
            const result = await capturePayPalOrder(data.orderID, createdBooking.booking_id, createdBooking.booking_reference);
            if (isMounted) callbacksRef.current.onSuccess(result);
          },
          onCancel: (data) => {
            if (!isMounted || approved) return;
            const orderId = data.orderID || activeOrderIdRef.current;
            if (orderId && activeOrderIdRef.current && orderId !== activeOrderIdRef.current) return;
            if (orderId) cancellation = cancelPayPalOrder(createdBooking.booking_id, orderId).catch(() => undefined);
            callbacksRef.current.onCancel();
          },
          onError: (error) => { if (isMounted) callbacksRef.current.onError(getPayPalErrorMessage(error)); },
        });
        return buttons.render(`#${containerId}`);
      })
      .catch((error: Error) => { if (isMounted) callbacksRef.current.onError(error.message); });

    return () => {
      isMounted = false;
      if (buttons) void buttons.close().catch(() => undefined);
    };
    // `language` only picks the wording of the "not configured" message on
    // mount; re-running this effect on a language toggle would tear down and
    // re-render the PayPal buttons mid-checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buttonStyle, clientId, containerId, createdBooking.booking_id, createdBooking.booking_reference]);

  return (
    <div className="mt-4 rounded-lg border border-ocean-400/20 bg-ocean-900/35 px-3 py-3 sm:px-4">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-3">
          <p className="text-sm font-extrabold text-white">{language === 'es' ? 'Pago seguro con PayPal' : 'Secure payment with PayPal'}</p>
          <p className="mt-0.5 text-xs font-medium text-ocean-300">{language === 'es' ? 'Completa tu pago de forma segura.' : 'Complete your payment securely.'}</p>
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
  const extrasTotal = props.selectedTour?.customQuote ? '-' : formatCurrency(props.pricing.extrasTotal);
  const includedItems = props.selectedTour ? getIncludedItems(props.selectedTour, language) : [];

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
        {includedItems.length > 0 ? <SummaryRow label={tr(text.booking.included, language)} multiline value={summarizeIncluded(includedItems, language)} /> : null}
        {Boolean(props.selectedTour?.mealOptions?.length) ? <SummaryRow label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
        <SummaryRow label={language === 'es' ? 'Lugar de salida' : 'Departure location'} value={props.departureLocation?.name ?? (language === 'es' ? 'No seleccionado' : 'Not selected')} />
        {props.currentStep >= 3 ? <SummaryRow label={language === 'es' ? 'Método de pago' : 'Payment method'} value={props.selectedPayment} /> : null}
      </div>
      <GlassPanel className="mt-2 p-2 text-xs" variant="subtle">
        <SummaryRow label={language === 'es' ? 'Precio base' : 'Package Price'} value={subtotal} />
        <SummaryRow label={language === 'es' ? 'Incluye hasta' : 'Includes up to'} value={`${getTourIncludedGuests(props.selectedBoat, props.selectedTour)} ${language === 'es' ? 'personas' : 'guests'}`} />
        {props.pricing.extraGuests > 0 ? <SummaryRow label={tr(text.booking.extraPeople, language)} value={`${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)}`} /> : null}
        <SummaryRow label={language === 'es' ? 'Cargo por salida' : 'Departure surcharge'} value={props.pricing.departureSurcharge > 0 ? formatCurrency(props.pricing.departureSurcharge) : (language === 'es' ? 'Sin costo' : 'No cost')} />
        <SummaryRow label="Extras" value={extrasTotal} />
        <SummaryRow label={`IVA (${Math.round(props.pricing.taxRate * 100)}%)`} value={formatCurrency(props.pricing.taxAmount)} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-2">
          <span className="text-sm font-extrabold text-white">Total</span>
          <span className="text-lg font-extrabold text-ocean-100">{props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total)}</span>
        </div>
      </GlassPanel>
    </GlassPanel>
  );
}

function BookingSuccessModal(props: {
  notice: { title: string; message: string; reference?: string; whatsappUrl?: string };
  onClose: () => void;
}) {
  const { language } = useLanguage();
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
              <span className="block text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Referencia' : 'Reference'}</span>
              <span className="mt-1 block font-extrabold text-white">{props.notice.reference}</span>
            </div>
          ) : null}
        </div>
      </div>
      {props.notice.whatsappUrl ? <a className="mt-5 block rounded-lg bg-green-600 px-4 py-3 text-center font-bold text-white" href={props.notice.whatsappUrl}>{language === 'es' ? 'Abrir WhatsApp' : 'Open WhatsApp'}</a> : null}
      <Button className="mt-5" fullWidth type="button" onClick={props.onClose}>{language === 'es' ? 'Cerrar' : 'Close'}</Button>
    </ModalShell>
  );
}

// The right-hand card stays compact: the first few items, then "+N" (the full list is in the step itself).
const SUMMARY_INCLUDED_LIMIT = 4;

// The list the Admin wrote, as one right-aligned value that may wrap onto several lines (see SummaryRow `multiline`): the first few
// items separated by bullets, then "+N more" (the whole list is in the Tour Details step).
function summarizeIncluded(items: string[], language: 'es' | 'en') {
  const shown = items.slice(0, SUMMARY_INCLUDED_LIMIT);
  const hidden = items.length - SUMMARY_INCLUDED_LIMIT;
  return (hidden > 0 ? [...shown, `+${hidden} ${language === 'es' ? 'más' : 'more'}`] : shown).join(' • ');
}

// label | value. `multiline` is for values that are a list (Included): the label stays on the left, the value keeps the right-hand
// column (capped so the label always has room), right-aligned like every other row, and wraps naturally onto as many lines as it needs.
function SummaryRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-x-4 border-b border-white/10 pb-0.5 last:border-b-0 last:pb-0', multiline ? 'items-start' : 'flex-wrap gap-y-0.5')}>
      <span className={cn('text-ocean-300', multiline && 'shrink-0')}>{label}</span>
      <span className={cn('text-right font-bold text-white', multiline && 'min-w-0 max-w-[72%] leading-5 [overflow-wrap:break-word]')}>{value}</span>
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
