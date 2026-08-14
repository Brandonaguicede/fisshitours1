import { CreditCard, Info, Mail, MessageCircle, Phone, Ship, User, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DISPLAY_PHONE } from '../../constants/contact';
import { boats } from '../../data/boats';
import { boatTours } from '../../data/boatTours';
import { getBoatText, getPackageLabel, getTourGroupKey, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { capturePayPalOrder, createPayPalOrder, loadPayPalSdk, type PayPalCaptureResult } from '../../services/paypalService';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { buildBookingPaymentPayload, createWhatsAppBookingMessage, getWhatsAppBookingUrl, type BookingPaymentMethod, type BookingStatus, type BookingPaymentPayload } from '../../utils/bookingPayment';
import { calculateBookingTotal, getEffectiveMaxGuests, getExtraGuestPrice, getTourIncludedGuests } from '../../utils/bookingPricing';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button } from '../common/Button';

type PaymentStatus = 'unpaid' | 'pending' | 'paid';

interface BookingPanelProps {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  selectedTimeSlotId?: string;
  onBoatChange: (boat: Boat) => void;
  onTourChange: (tour?: BoatTour) => void;
}

const paymentMethods: Array<{ id: BookingPaymentMethod; title: string; description: string; icon: typeof CreditCard }> = [
  { id: 'paypal', title: 'Pay with PayPal', description: 'Pay the full reservation total securely in USD.', icon: CreditCard },
  { id: 'whatsapp-link', title: 'Request Payment Link via WhatsApp', description: 'Send your booking details and request a payment link.', icon: MessageCircle },
  { id: 'pay-on-day', title: 'Pay on the Day of the Tour', description: 'Request availability and leave the booking pending confirmation.', icon: WalletCards },
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
        'Se requiere un deposito del 50% para asegurar la reserva. El saldo restante se paga el dia del tour.',
        'Metodos de pago: transferencia bancaria, SINPE Movil y PayPal. Las comisiones de transferencia y PayPal las cubre el cliente.',
        'Cancelacion al menos 3 dias antes del tour: reembolso del 100% sin penalidad.',
        'Cancelacion dentro de 3 dias: penalidad del 30% por costos operativos y alquiler del bote. Reprogramar dentro de 3 dias es permitido segun disponibilidad.',
        'Cancelacion dentro de 24 horas: penalidad del 100% por costos operativos, alquiler del bote, comida y bebidas. No-show: el deposito no es reembolsable.',
        'Reembolso o reprogramacion por clima solo aplica por huracanes, pronostico de oleaje fuerte, vientos altos o lluvia fuerte dentro de 24 horas antes del tour. Dias nublados o poca luz solar no califican.',
      ]
    : [
        '50% deposit required to secure the reservation. Remaining balance is paid on the day of the tour.',
        'Payment methods: bank transfer, SINPE Movil and PayPal. Bank transfer and PayPal fees are covered by the client.',
        'Cancellation at least 3 days before the tour: 100% refund without penalty.',
        'Cancellation within 3 days: 30% penalty due to operational and boat rental costs. Rescheduling within 3 days is allowed for another available date, subject to availability.',
        'Cancellation within 24 hours: 100% penalty due to operational, boat rental, food and beverage costs. No-show deposits are not refunded.',
        'Refund or rescheduling for weather applies only to hurricanes, strong wave forecasts, high winds or heavy rain within 24 hours before the tour. Cloudy days or limited sunlight do not qualify.',
      ];
}

export function BookingPanel({ selectedBoat, selectedTour, selectedTimeSlotId, onBoatChange, onTourChange }: BookingPanelProps) {
  const { language } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const [date, setDate] = useState('2026-08-15');
  const [timeSlotId, setTimeSlotId] = useState(selectedTimeSlotId ?? selectedTour?.timeSlots[0]?.id ?? '');
  const [guests, setGuests] = useState(selectedTour ? getTourIncludedGuests(selectedBoat, selectedTour) : selectedBoat.includedGuests);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [mealOption, setMealOption] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<BookingPaymentMethod>('paypal');
  const [isPayOnDayOpen, setIsPayOnDayOpen] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('draft');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [validationMessage, setValidationMessage] = useState('');
  const [paypalVisible, setPaypalVisible] = useState(false);
  const [paypalError, setPaypalError] = useState('');
  const [paypalSuccess, setPaypalSuccess] = useState<PayPalCaptureResult | null>(null);
  const bookingReferenceRef = useRef(`PFT-${Date.now().toString(36).toUpperCase()}`);

  const availableTours = useMemo(() => boatTours.filter((tour) => tour.boatId === selectedBoat.id), [selectedBoat.id]);
  const effectiveMaxGuests = getEffectiveMaxGuests(selectedBoat, selectedTour);
  const includedGuests = getTourIncludedGuests(selectedBoat, selectedTour);
  const extraGuestPrice = getExtraGuestPrice(selectedBoat, selectedTour);
  const pricing = calculateBookingTotal(selectedBoat, selectedTour, guests);
  const selectedTimeSlot = selectedTour?.timeSlots.find((slot) => slot.id === timeSlotId);
  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethod) ?? paymentMethods[0];
  const steps = [tr(text.booking.steps.boat, language), tr(text.booking.steps.tour, language), tr(text.booking.steps.data, language)];
  const hasCapacityError = guests > effectiveMaxGuests;
  const canContinueToCustomer = Boolean(selectedTour && selectedTimeSlot && !hasCapacityError);
  const canReview = Boolean(canContinueToCustomer && customerName.trim() && customerEmail.trim() && customerWhatsapp.trim() && isValidEmail(customerEmail));
  const bookingPayload = selectedTour
    ? buildBookingPaymentPayload({
        bookingReference: bookingReferenceRef.current,
        customerName,
        phone: customerWhatsapp,
        email: customerEmail,
        boat: selectedBoat,
        tour: selectedTour,
        timeSlot: selectedTimeSlot,
        date,
        guests,
        pricing,
        specialRequests,
      })
    : null;

  useEffect(() => {
    if (selectedTour && !selectedTour.timeSlots.some((slot) => slot.id === timeSlotId)) {
      setTimeSlotId(selectedTour.timeSlots[0]?.id ?? '');
    }
  }, [selectedTour, timeSlotId]);

  function handleBoatChange(boatId: string) {
    const nextBoat = boats.find((boat) => boat.id === boatId);
    if (!nextBoat) return;
    onBoatChange(nextBoat);
    onTourChange(undefined);
    setTimeSlotId('');
    setGuests(nextBoat.includedGuests);
    setBookingStatus('draft');
    setPaymentStatus('unpaid');
    setPaypalVisible(false);
    setPaypalSuccess(null);
  }

  function handleTourChange(tourId: string) {
    const nextTour = availableTours.find((tour) => tour.id === tourId);
    onTourChange(nextTour);
    setTimeSlotId(nextTour?.timeSlots[0]?.id ?? '');
    if (nextTour) setGuests(getTourIncludedGuests(selectedBoat, nextTour));
    if (!nextTour || !isFullDayTour(nextTour)) setMealOption('');
    setBookingStatus('draft');
    setPaymentStatus('unpaid');
    setPaypalVisible(false);
    setPaypalSuccess(null);
  }

  function canVisitStep(stepIndex: number) {
    if (stepIndex <= activeStep) return true;
    if (stepIndex === 1) return true;
    return canContinueToCustomer;
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
    if (guests < 1 || guests > 10 || guests > effectiveMaxGuests) {
      setActiveStep(1);
      setValidationMessage('Please select between 1 and 10 guests.');
      return null;
    }
    if (!customerName.trim()) {
      setActiveStep(2);
      setValidationMessage('Please enter the customer name.');
      return null;
    }
    if (!customerWhatsapp.trim()) {
      setActiveStep(2);
      setValidationMessage('Please enter the phone number.');
      return null;
    }
    if (!isValidEmail(customerEmail)) {
      setActiveStep(2);
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

  function openWhatsAppBooking(booking: BookingPaymentPayload, variant: 'payment_link' | 'pay_on_day' | 'paid_confirmation') {
    window.open(getWhatsAppBookingUrl(createWhatsAppBookingMessage(booking, variant)), '_blank', 'noopener,noreferrer');
  }

  function handlePaymentLinkRequest() {
    const booking = validateBookingForPayment();
    if (!booking) return;
    setPaymentMethod('whatsapp-link');
    setBookingStatus('payment_link_requested');
    setPaymentStatus('pending');
    setPaypalVisible(false);
    openWhatsAppBooking(booking, 'payment_link');
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
    setBookingStatus('pay_on_tour_day');
    setPaymentStatus('pending');
    setIsPayOnDayOpen(false);
    openWhatsAppBooking(booking, 'pay_on_day');
  }

  function handlePayPalRequest() {
    const booking = validateBookingForPayment();
    if (!booking) return;
    setPaymentMethod('paypal');
    setBookingStatus('pending_payment');
    setPaymentStatus('pending');
    setPaypalError('');
    setPaypalVisible(true);
  }

  return (
    <div className="relative -mx-4 overflow-hidden rounded-none border-y border-ocean-500/20 bg-ocean-950 p-3 text-white shadow-lifted sm:mx-0 sm:rounded-2xl sm:border sm:p-4 lg:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(110,172,201,0.16),transparent_24rem),radial-gradient(circle_at_92%_16%,rgba(73,134,167,0.12),transparent_22rem)]" />
      <div className="relative mx-auto max-w-xl text-center">
        <span className="inline-flex rounded-full border border-ocean-500/35 bg-ocean-500/10 px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-ocean-400 sm:px-4 sm:text-[0.68rem] sm:tracking-[0.18em]">{tr(text.booking.badge, language)}</span>
        <h2 className="mt-2 text-2xl font-extrabold leading-tight text-white min-[420px]:text-3xl sm:text-[2rem]">{tr(text.booking.title, language)}</h2>
        <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-5 text-ocean-200 sm:text-sm">{tr(text.booking.subtitle, language)}</p>
      </div>

      <div className="relative mx-auto mt-4 grid max-w-sm grid-cols-3 items-start gap-1 sm:mt-5 sm:gap-2">
        {steps.map((step, index) => (
          <button
            key={step}
            className={cn(
              'focus-ring group relative grid min-w-0 justify-items-center gap-2 rounded-2xl px-1 py-1 text-center transition-colors duration-200 sm:px-2',
              index < steps.length - 1 && 'after:absolute after:left-[calc(50%+1.25rem)] after:top-4 after:h-px after:w-[calc(100%-2.5rem)] after:bg-ocean-700/70',
            )}
            type="button"
            aria-current={activeStep === index ? 'step' : undefined}
            aria-disabled={!canVisitStep(index)}
            onClick={() => goToStep(index)}
          >
            <span className={cn('grid h-7 w-7 place-items-center rounded-full border text-xs font-extrabold transition-[background-color,border-color,color,box-shadow] duration-200 sm:h-8 sm:w-8 sm:text-sm', activeStep === index ? 'border-ocean-400 bg-ocean-500 text-ocean-950 shadow-[0_0_18px_rgba(110,172,201,0.28)]' : activeStep > index ? 'border-seafoam-400 bg-seafoam-500 text-ocean-950' : 'border-ocean-700 bg-ocean-900 text-ocean-300')}>
              {index + 1}
            </span>
            <span className={cn('max-w-full text-[0.62rem] font-bold leading-tight sm:text-[0.68rem]', activeStep === index ? 'text-ocean-300' : 'text-ocean-600')}>{step}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-5 grid gap-3 xl:mt-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-soft backdrop-blur-xl min-[420px]:p-4">
          {activeStep === 0 ? (
            <BoatStep selectedBoat={selectedBoat} onBoatChange={handleBoatChange} onNext={() => setActiveStep(1)} />
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
            <CustomerStep
              customerName={customerName}
              customerEmail={customerEmail}
              customerWhatsapp={customerWhatsapp}
              specialRequests={specialRequests}
              paymentMethod={paymentMethod}
              paymentMethods={paymentMethods}
              bookingStatus={bookingStatus}
              paymentStatus={paymentStatus}
              canReview={canReview}
              validationMessage={validationMessage}
              booking={bookingPayload}
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
                setBookingStatus('paid');
                setPaymentStatus('paid');
              }}
              onPayPalError={(message) => {
                setPaypalError(message);
                setBookingStatus('payment_failed');
                setPaymentStatus('unpaid');
              }}
              onPayPalCancel={() => {
                setPaypalError('Payment was cancelled. You can try again or select another payment method.');
                setBookingStatus('payment_failed');
                setPaymentStatus('unpaid');
              }}
              onSendPaidConfirmation={() => {
                const booking = validateBookingForPayment();
                if (booking) openWhatsAppBooking(booking, 'paid_confirmation');
              }}
              onBack={() => setActiveStep(1)}
            />
          ) : null}
        </div>

        <div className="xl:hidden">
          <BookingProgressSummary
            selectedBoat={selectedBoat}
            selectedTour={selectedTour}
            date={date}
            selectedTimeSlot={selectedTimeSlot}
            guests={guests}
            mealOption={mealOption}
            pricing={pricing}
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
          onBack={() => setIsPayOnDayOpen(false)}
          onConfirm={handleConfirmPayOnDay}
        />
      ) : null}
    </div>
  );
}

function BoatStep(props: { selectedBoat: Boat; onBoatChange: (boatId: string) => void; onNext: () => void }) {
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
        {boats.map((boat) => (
          <button
            key={boat.id}
            className={cn(
              'focus-ring pressable grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-ocean-400/60 hover:bg-ocean-500/10 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-3 sm:p-2.5',
              props.selectedBoat.id === boat.id && 'border-ocean-400 bg-ocean-500/15 shadow-[0_0_0_1px_rgba(110,172,201,0.22)]',
            )}
            type="button"
            onClick={() => props.onBoatChange(boat.id)}
          >
            <img src={boat.image} alt={boat.name} className="h-12 w-12 rounded-xl object-cover sm:h-14 sm:w-14" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-white sm:text-base">{boat.name}</span>
              <span className="mt-1 block text-xs font-semibold text-ocean-200">{boat.includedGuests} {tr(text.booking.people, language)} - {boat.length}</span>
              <span className="mt-1 block text-xs font-medium text-ocean-400">{boat.featuredSpec}</span>
            </span>
            <span className="col-span-2 text-sm font-extrabold text-ocean-400 sm:col-span-1 sm:text-right">{boat.basePriceLabel.replace('From ', '')}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 sm:mt-5">
        <Button className="w-full bg-ocean-500 text-ocean-950 hover:bg-[#7ED8F4]" type="button" onClick={props.onNext}>
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
            <button
              key={group.key}
              className={cn('focus-ring pressable min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-left hover:bg-ocean-500/10 sm:p-3', activeGroup === group.key && 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10')}
              type="button"
              onClick={() => props.onTourChange(group.tours[0].id)}
            >
              <span className="block truncate text-sm font-extrabold text-white">{group.label}</span>
              <span className="mt-1 block text-xs font-bold text-ocean-400">From {formatCurrency(group.tours[0].basePrice)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {activeGroupData ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Escoge por precio' : 'Choose by price'}</legend>
          <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2 min-[640px]:grid-cols-3">
            {activeGroupData.tours.map((tour) => (
              <label key={tour.id} className={cn('pressable min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 hover:bg-ocean-500/10 sm:p-3', props.selectedTour?.id === tour.id && 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10')}>
                <input className="sr-only" type="radio" name="tourPackage" value={tour.id} checked={props.selectedTour?.id === tour.id} onChange={() => props.onTourChange(tour.id)} />
                <span className="block truncate text-xs font-extrabold text-white">{getPackageLabel(tour, language)}</span>
                <span className="mt-1 block text-lg font-extrabold text-ocean-400">{formatCurrency(tour.basePrice)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {isFullDayTour(props.selectedTour) ? (
        <fieldset className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
          <legend className="px-1 text-sm font-bold text-ocean-100">{language === 'es' ? 'Comida opcional para Dia completo' : 'Optional meal for Full Day'}</legend>
          <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
            {fullDayMealOptions.map((meal) => (
              <label key={meal.en} className={cn('pressable rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-xs font-bold leading-5 text-ocean-100 hover:bg-ocean-500/10 sm:p-3 sm:text-sm', props.mealOption === meal[language] && 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10')}>
                <input className="sr-only" type="radio" name="mealOption" value={meal[language]} checked={props.mealOption === meal[language]} onChange={() => props.onMealOptionChange(meal[language])} />
                {meal[language]}
              </label>
            ))}
          </div>
          <button className="mt-3 text-xs font-bold text-ocean-400 underline-offset-4 hover:underline" type="button" onClick={() => props.onMealOptionChange('')}>
            {language === 'es' ? 'Sin comida seleccionada' : 'No meal selected'}
          </button>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-bold text-ocean-100">
          {tr(text.booking.date, language)}
          <input className="focus-ring min-w-0 w-full rounded-2xl border border-white/10 bg-ocean-900 px-3 py-3 text-sm text-white focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15 sm:px-4" type="date" value={props.date} onChange={(event) => props.onDateChange(event.target.value)} />
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-ocean-100">
          {tr(text.booking.guests, language)}
          <input className="focus-ring min-w-0 w-full rounded-2xl border border-white/10 bg-ocean-900 px-3 py-3 text-sm text-white focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15 sm:px-4" type="number" inputMode="numeric" min={1} max={props.effectiveMaxGuests} value={props.guests} onChange={(event) => props.onGuestsChange(clampGuests(Number(event.target.value), props.effectiveMaxGuests))} />
          {props.hasCapacityError ? <span className="text-sm text-red-300">{language === 'es' ? `Este barco tiene capacidad maxima de ${props.effectiveMaxGuests} personas.` : `This boat has a maximum capacity of ${props.effectiveMaxGuests} guests.`}</span> : null}
        </label>
      </div>

      {props.selectedTour ? (
        <fieldset>
          <legend className="text-sm font-bold text-ocean-100">{tr(text.booking.departure, language)}</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
            {props.selectedTour.timeSlots.map((slot) => (
              <label key={slot.id} className={cn('pressable min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center hover:bg-ocean-500/10', props.timeSlotId === slot.id && 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10')}>
                <input className="sr-only" type="radio" name="timeSlot" value={slot.id} checked={props.timeSlotId === slot.id} onChange={() => props.onTimeSlotChange(slot.id)} />
                <span className="block truncate text-xs font-extrabold text-white">{slot.label}</span>
                <span className="mt-1 block text-base font-extrabold text-ocean-600 sm:text-lg">{slot.time}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {props.selectedTour && props.guests > props.includedGuests && !props.hasCapacityError ? (
        <div className="rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-3 text-ocean-100 sm:p-4">
          <p className="flex items-start gap-2 text-sm font-bold sm:text-base"><Info size={18} className="mt-0.5 shrink-0 text-ocean-600" /> {language === 'es' ? `Tu tour incluye ${props.includedGuests} personas.` : `Your tour includes ${props.includedGuests} guests.`}</p>
          <p className="mt-2 text-sm">{language === 'es' ? `${props.pricing.extraGuests} personas extra x ${formatCurrency(props.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : `${props.pricing.extraGuests} additional guests x ${formatCurrency(props.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}`}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
        <Button type="button" variant="secondary" onClick={props.onBack}>
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

function isFullDayTour(tour?: BoatTour) {
  return Boolean(tour?.name.toLowerCase().includes('full day'));
}

function clampGuests(value: number, maxGuests: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), Math.min(maxGuests, 10));
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
  booking: BookingPaymentPayload | null;
  paypalVisible: boolean;
  paypalError: string;
  paypalSuccess: PayPalCaptureResult | null;
  onCustomerNameChange: (name: string) => void;
  onCustomerEmailChange: (email: string) => void;
  onCustomerWhatsappChange: (value: string) => void;
  onSpecialRequestsChange: (value: string) => void;
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
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          {tr(text.booking.fullName, language)}
          <span className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} placeholder="John Smith" autoComplete="name" />
          </span>
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          {tr(text.booking.email, language)}
          <span className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" type="email" value={props.customerEmail} onChange={(event) => props.onCustomerEmailChange(event.target.value)} placeholder="john@email.com" autoComplete="email" spellCheck={false} />
          </span>
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          {tr(text.booking.phone, language)}
          <span className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" type="tel" inputMode="tel" value={props.customerWhatsapp} onChange={(event) => props.onCustomerWhatsappChange(event.target.value)} placeholder={DISPLAY_PHONE} autoComplete="tel" />
          </span>
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          Special requests
          <textarea className="focus-ring min-h-[6rem] w-full resize-y rounded-xl border border-white/10 bg-ocean-950/65 px-4 py-3 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" value={props.specialRequests} onChange={(event) => props.onSpecialRequestsChange(event.target.value)} placeholder="Optional meal notes, celebration details, accessibility needs..." />
        </label>
      </div>

      <div className="mt-5">
        <BookingPaymentSummary booking={props.booking} />
      </div>

      {props.validationMessage ? (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100" aria-live="polite">
          {props.validationMessage}
        </div>
      ) : null}

      <fieldset className="mt-5">
        <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Payment method</legend>
        <div className="mt-3 grid gap-2">
          {props.paymentMethods.map((method) => (
            <button
              key={method.id}
              className={cn('pressable flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-ocean-500/10', props.paymentMethod === method.id && 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10')}
              type="button"
              onClick={() => handlePaymentMethodAction(method.id)}
            >
              <method.icon className="mt-0.5 shrink-0 text-ocean-400" size={17} />
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-white">{method.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-ocean-200">{method.description}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {props.paypalVisible && props.booking ? (
        <PayPalCheckoutBox booking={props.booking} onSuccess={props.onPayPalSuccess} onError={props.onPayPalError} onCancel={props.onPayPalCancel} />
      ) : null}

      {props.paypalError ? (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-bold">Payment could not be completed</p>
          <p className="mt-1">{props.paypalError}</p>
        </div>
      ) : null}

      {props.paypalSuccess && props.booking ? (
        <div className="mt-4 rounded-2xl border border-seafoam-400/30 bg-seafoam-500/10 p-4 text-ocean-50">
          <p className="text-lg font-extrabold">Payment completed successfully</p>
          <div className="mt-3 grid gap-2 text-sm">
            <SummaryLine label="Booking reference" value={props.paypalSuccess.bookingReference} />
            <SummaryLine label="Amount paid" value={`${props.paypalSuccess.amount} ${props.paypalSuccess.currency}`} />
            <SummaryLine label="PayPal order reference" value={props.paypalSuccess.orderId} />
            <SummaryLine label="PayPal transaction reference" value={props.paypalSuccess.transactionId} />
            <SummaryLine label="Tour information" value={`${getTourText(props.booking.tour, 'en').title} - ${props.booking.packageLabel}`} />
          </div>
          <Button className="mt-4 w-full bg-ocean-500 text-ocean-950 hover:bg-[#7ED8F4]" type="button" onClick={props.onSendPaidConfirmation}>Send confirmation via WhatsApp</Button>
        </div>
      ) : null}

      {props.bookingStatus === 'payment_link_requested' ? (
        <div className="mt-5 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">Payment link request opened</p>
          <p className="mt-1 text-sm">Complete the request in WhatsApp. This does not mark the reservation as paid.</p>
        </div>
      ) : null}

      {props.bookingStatus === 'pay_on_tour_day' ? (
        <div className="mt-5 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">Reservation request opened</p>
          <p className="mt-1 text-sm">The reservation remains pending confirmation until availability is confirmed.</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col-reverse gap-3 pt-7 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={props.onBack}>Back</Button>
        <span className="text-xs font-semibold text-ocean-400">Status: {props.bookingStatus.split('_').join(' ')} - Payment: {props.paymentStatus}</span>
      </div>
    </div>
  );
}

function BookingPaymentSummary({ booking }: { booking: BookingPaymentPayload | null }) {
  if (!booking) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-ocean-200">
        Complete the tour selection to review the reservation summary.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
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
        <SummaryLine label="Base price" value={formatCurrency(booking.basePrice)} />
        <SummaryLine label="Additional guests" value={String(booking.additionalGuests)} />
        <SummaryLine label="Additional guest charge" value={formatCurrency(booking.additionalGuestCharge)} />
        <SummaryLine label="Total price" value={formatCurrency(booking.total)} />
        <SummaryLine label="Special requests" value={booking.specialRequests || 'None'} />
      </div>
    </div>
  );
}

function PayPalCheckoutBox(props: {
  booking: BookingPaymentPayload;
  onSuccess: (result: PayPalCaptureResult) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const { booking, onSuccess, onError, onCancel } = props;
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const containerId = `paypal-button-container-${booking.bookingReference}`;

  useEffect(() => {
    let isMounted = true;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    if (!clientId) {
      onError('PayPal is not configured. Set VITE_PAYPAL_CLIENT_ID to enable sandbox checkout.');
      return;
    }

    loadPayPalSdk(clientId)
      .then(() => {
        if (!isMounted || !window.paypal) return;
        return window.paypal.Buttons({
          style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' },
          createOrder: () => createPayPalOrder(booking),
          onApprove: async (data) => {
            const result = await capturePayPalOrder(data.orderID, booking);
            onSuccess(result);
          },
          onCancel,
          onError: () => onError('PayPal returned an error. Please try again or choose another payment method.'),
        }).render(`#${containerId}`);
      })
      .catch((error: Error) => onError(error.message));

    return () => {
      isMounted = false;
    };
  }, [booking, booking.bookingReference, clientId, containerId]);

  return (
    <div className="mt-4 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4">
      <p className="mb-3 text-sm font-bold text-ocean-100">PayPal Sandbox checkout</p>
      <div id={containerId} />
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
}) {
  const { language } = useLanguage();
  const terms = getBookingTerms(language);
  const coverImage = props.selectedBoat.image;
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : tr(text.booking.selectTour, language);
  const subtotal = props.selectedTour?.customQuote ? 'Custom quote' : formatCurrency(props.pricing.basePrice);
  const taxes = props.selectedTour?.customQuote ? '-' : formatCurrency(Math.max(props.pricing.total - props.pricing.basePrice - props.pricing.extraGuestsTotal, 0));

  return (
    <aside className="h-fit rounded-2xl border border-ocean-500/35 bg-white/[0.06] p-3 text-white shadow-soft backdrop-blur-xl min-[420px]:p-4 sm:p-4">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">{tr(text.booking.summary, language)}</p>
      <img src={coverImage} alt={props.selectedBoat.name} className="mt-3 hidden aspect-[16/7] w-full rounded-2xl object-cover min-[520px]:block xl:aspect-[16/8]" loading="lazy" />
      <div className="mt-3 sm:mt-5">
        <h3 className="text-xl font-extrabold text-white">{props.selectedBoat.name}</h3>
        <p className="mt-1 text-sm font-semibold text-ocean-300">{props.selectedBoat.includedGuests} {tr(text.booking.people, language)} - {props.selectedBoat.length} - {props.selectedBoat.engine}</p>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-ocean-100">
        <SummaryRow label={tr(text.booking.tourType, language)} value={props.selectedTour ? `${selectedTourName}${props.selectedTour.duration ? ` (${props.selectedTour.duration}h)` : ''}` : tr(text.booking.selectTour, language)} />
        <SummaryRow label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
        <SummaryRow label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot?.time ?? tr(text.booking.selectTime, language)} />
        <SummaryRow label={tr(text.booking.guests, language)} value={`${props.guests} ${tr(text.booking.people, language)}`} />
        {isFullDayTour(props.selectedTour) ? <SummaryRow label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
      </div>
      <div className="mt-4 rounded-2xl border border-ocean-500/25 bg-ocean-900/70 p-3 sm:mt-6 sm:p-4">
        <SummaryRow label="Subtotal" value={subtotal} />
        {props.pricing.extraGuests > 0 ? <SummaryRow label={tr(text.booking.extraPeople, language)} value={`${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)}`} /> : null}
        <SummaryRow label={tr(text.booking.taxes, language)} value={taxes} />
        <SummaryRow label={language === 'es' ? 'Deposito requerido' : 'Required deposit'} value={props.selectedTour?.customQuote ? (language === 'es' ? 'Por confirmar' : 'To be confirmed') : formatCurrency(props.pricing.total * 0.5)} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
          <span className="font-extrabold text-white">Total</span>
          <span className="text-2xl font-extrabold text-ocean-400 sm:text-3xl">{props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total)}</span>
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-ocean-300">{tr(text.booking.secure, language)}</p>
      <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-ocean-300">
        {terms.slice(0, 3).map((term) => (
          <p key={term}>{term}</p>
        ))}
      </div>
    </aside>
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
  activeStep: number;
}) {
  const { language } = useLanguage();
  const total = props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total);
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : tr(text.booking.selectTour, language);

  return (
    <aside className="rounded-2xl border border-ocean-500/30 bg-white/[0.06] p-3 text-white shadow-soft backdrop-blur-xl">
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
          {isFullDayTour(props.selectedTour) ? <SummaryMini label="Meal" value={props.mealOption || 'Not selected'} /> : null}
        </div>
      ) : null}

      {props.activeStep >= 2 ? (
        <div className="mt-3 flex flex-wrap justify-between gap-3 rounded-xl border border-ocean-500/20 bg-ocean-900/60 p-3 text-sm">
          <span className="text-ocean-300">{tr(text.booking.guests, language)}</span>
          <span className="font-bold text-white">{props.guests} {tr(text.booking.people, language)}</span>
        </div>
      ) : null}
    </aside>
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
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { language } = useLanguage();
  const terms = getBookingTerms(language);
  const selectedTourName = props.selectedTour ? `${getTourText(props.selectedTour, language).title} - ${getPackageLabel(props.selectedTour, language)}` : (language === 'es' ? 'No seleccionado' : 'Not selected');
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ocean-950/70 px-3 py-4 backdrop-blur-sm sm:px-4">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-ocean-950 p-4 text-white shadow-lifted sm:rounded-[2rem] sm:p-8">
        <img className="mb-5 aspect-[16/7] w-full rounded-2xl object-cover" src={props.selectedBoat.image} alt={props.selectedBoat.name} loading="lazy" />
        <h3 className="text-3xl font-extrabold text-white">{language === 'es' ? 'Revisar reserva' : 'Review reservation'}</h3>
        <p className="mt-3 leading-7 text-ocean-200">
          {language === 'es' ? 'Revisa los detalles antes de confirmar la solicitud. Se requiere un deposito del 50% para asegurar la reserva y el saldo restante se paga el dia del tour.' : 'Review your reservation details before confirming this request. A 50% deposit is required to secure the reservation, and the remaining balance is paid on the day of the tour.'}
        </p>
        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
          <SummaryLine label={language === 'es' ? 'Barco' : 'Boat'} value={props.selectedBoat.name} />
          <SummaryLine label="Tour" value={selectedTourName} />
          <SummaryLine label={language === 'es' ? 'Fecha' : 'Date'} value={formatDisplayDate(props.date)} />
          <SummaryLine label={language === 'es' ? 'Salida' : 'Departure time'} value={props.departure} />
          <SummaryLine label={language === 'es' ? 'Personas' : 'Guests'} value={String(props.guests)} />
          {isFullDayTour(props.selectedTour) ? <SummaryLine label={language === 'es' ? 'Comida' : 'Meal option'} value={props.mealOption || (language === 'es' ? 'No seleccionada' : 'Not selected')} /> : null}
          <SummaryLine label={language === 'es' ? 'Cargos por personas extra' : 'Additional guest charges'} value={props.pricing.extraGuests > 0 ? `${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : '$0'} />
          <SummaryLine label="Total" value={props.pricing.isCustomQuote ? 'Custom quote' : formatCurrency(props.pricing.total)} />
          <SummaryLine label={language === 'es' ? 'Deposito requerido' : 'Required deposit'} value={props.pricing.isCustomQuote ? (language === 'es' ? 'Por confirmar' : 'To be confirmed') : formatCurrency(props.pricing.total * 0.5)} />
          <SummaryLine label={language === 'es' ? 'Saldo restante' : 'Remaining balance'} value={language === 'es' ? 'Se paga el dia del tour' : 'Paid on the day of the tour'} />
          <SummaryLine label={language === 'es' ? 'Nombre' : 'Customer name'} value={props.customerName} />
          <SummaryLine label="Email" value={props.customerEmail} />
          <SummaryLine label={language === 'es' ? 'Numero de WhatsApp' : 'WhatsApp number'} value={props.customerWhatsapp} />
          <SummaryLine label="Special requests" value={props.specialRequests || 'None'} />
          <SummaryLine label={language === 'es' ? 'Metodo de pago' : 'Payment method'} value={props.paymentMethod} />
        </div>
        <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-ocean-200">
          {terms.map((term) => (
            <p key={term}>{term}</p>
          ))}
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={props.onBack}>
            {language === 'es' ? 'Volver' : 'Go Back'}
          </Button>
          <Button type="button" onClick={props.onConfirm}>
            {language === 'es' ? 'Confirmar reserva' : 'Confirm reservation'}
          </Button>
        </div>
      </div>
    </div>
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
