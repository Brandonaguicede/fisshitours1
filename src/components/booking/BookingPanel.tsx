import { CreditCard, Info, Mail, MessageCircle, Phone, Ship, User, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DISPLAY_PHONE, WHATSAPP_NUMBER } from '../../constants/contact';
import { boats } from '../../data/boats';
import { boatTours } from '../../data/boatTours';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { calculateBookingTotal, getEffectiveMaxGuests, getExtraGuestPrice, getTourIncludedGuests } from '../../utils/bookingPricing';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button } from '../common/Button';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';

type PaymentMethod = 'paypal' | 'pay-on-day' | 'whatsapp-link';
type BookingStatus = 'draft' | 'reviewing' | 'payment-link-requested' | 'reserved';
type PaymentStatus = 'unpaid' | 'pending' | 'paid';

interface BookingPanelProps {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  selectedTimeSlotId?: string;
  onBoatChange: (boat: Boat) => void;
  onTourChange: (tour?: BoatTour) => void;
}

const paymentMethods: Array<{ id: PaymentMethod; title: string; description: string; icon: typeof CreditCard }> = [
  { id: 'paypal', title: 'PayPal', description: 'Secure online payment.', icon: CreditCard },
  { id: 'pay-on-day', title: 'Pay on the day', description: 'Reserve now and pay on the day of your tour.', icon: WalletCards },
  { id: 'whatsapp-link', title: 'Payment link via WhatsApp', description: 'Send your booking details and receive a payment link from our team.', icon: MessageCircle },
];

export function BookingPanel({ selectedBoat, selectedTour, selectedTimeSlotId, onBoatChange, onTourChange }: BookingPanelProps) {
  const { language } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const [date, setDate] = useState('2026-08-15');
  const [timeSlotId, setTimeSlotId] = useState(selectedTimeSlotId ?? selectedTour?.timeSlots[0]?.id ?? '');
  const [guests, setGuests] = useState(selectedTour ? getTourIncludedGuests(selectedBoat, selectedTour) : selectedBoat.includedGuests);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paypal');
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('draft');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid');

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
  const canReview = Boolean(canContinueToCustomer && customerName.trim() && customerEmail.trim() && customerWhatsapp.trim());

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
  }

  function handleTourChange(tourId: string) {
    const nextTour = availableTours.find((tour) => tour.id === tourId);
    onTourChange(nextTour);
    setTimeSlotId(nextTour?.timeSlots[0]?.id ?? '');
    if (nextTour) setGuests(getTourIncludedGuests(selectedBoat, nextTour));
    setBookingStatus('draft');
    setPaymentStatus('unpaid');
  }

  function openReview() {
    if (!canReview) return;
    setBookingStatus('reviewing');
    setIsReviewOpen(true);
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

  function buildWhatsAppMessage() {
    const lines = [
      'Hello, I would like to request a payment link for my booking.',
      '',
      `Boat: ${selectedBoat.name}`,
      `Tour: ${selectedTour?.name ?? 'Not selected'}`,
      `Date: ${formatDisplayDate(date)}`,
      `Departure: ${selectedTimeSlot?.time ?? 'Not selected'}`,
      `Guests: ${guests}`,
      '',
      pricing.isCustomQuote ? 'Pricing: Custom quote requested' : `Base price: ${formatCurrency(pricing.basePrice)}`,
    ];

    if (pricing.extraGuests > 0) {
      lines.push(`Additional guests: ${pricing.extraGuests} x ${formatCurrency(pricing.extraGuestPrice)} = ${formatCurrency(pricing.extraGuestsTotal)}`);
    }

    lines.push('', `Total: ${pricing.isCustomQuote ? 'Custom quote' : formatCurrency(pricing.total)}`, '', `Name: ${customerName}`, `Email: ${customerEmail}`, `WhatsApp: ${customerWhatsapp}`, '', 'Please send me the payment link for this reservation.');
    return lines.join('\n');
  }

  function handleConfirmReview() {
    if (paymentMethod === 'whatsapp-link') {
      setBookingStatus('payment-link-requested');
      setPaymentStatus('pending');
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage())}`, '_blank', 'noopener,noreferrer');
      setIsReviewOpen(false);
      return;
    }

    setBookingStatus('reserved');
    setPaymentStatus('pending');
    setIsReviewOpen(false);
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
              hasCapacityError={hasCapacityError}
              canContinue={canContinueToCustomer}
              onTourChange={handleTourChange}
              onDateChange={setDate}
              onGuestsChange={setGuests}
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
              bookingStatus={bookingStatus}
              canReview={canReview}
              onCustomerNameChange={setCustomerName}
              onCustomerEmailChange={setCustomerEmail}
              onCustomerWhatsappChange={setCustomerWhatsapp}
              onBack={() => setActiveStep(1)}
              onReview={openReview}
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
            pricing={pricing}
          />
        </div>
      </div>

      {isReviewOpen ? (
        <ReviewModal
          selectedBoat={selectedBoat}
          selectedTour={selectedTour}
          date={date}
          departure={selectedTimeSlot?.time ?? 'Not selected'}
          guests={guests}
          customerName={customerName}
          customerEmail={customerEmail}
          customerWhatsapp={customerWhatsapp}
          paymentMethod={selectedPayment.title}
          pricing={pricing}
          onBack={() => setIsReviewOpen(false)}
          onConfirm={handleConfirmReview}
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
  hasCapacityError: boolean;
  canContinue: boolean;
  onTourChange: (tourId: string) => void;
  onDateChange: (date: string) => void;
  onGuestsChange: (guests: number) => void;
  onTimeSlotChange: (slotId: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { language } = useLanguage();

  return (
    <div className="grid gap-4 text-white sm:gap-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400 sm:text-sm">{tr(text.booking.tourDetails, language)}</p>
        <h3 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">{tr(text.booking.buildReservation, language)}</h3>
      </div>
      <label className="grid min-w-0 gap-2 text-sm font-bold text-ocean-100">
        <span className="min-w-0 truncate">{tr(text.booking.tourAboard, language)} {props.selectedBoat.name}</span>
        <select className="focus-ring min-w-0 w-full rounded-2xl border border-white/10 bg-ocean-900 px-3 py-3 text-sm text-white focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15 sm:px-4" value={props.selectedTour?.id ?? ''} onChange={(event) => props.onTourChange(event.target.value)}>
          <option value="">{tr(text.booking.selectTour, language)}</option>
          {props.availableTours.map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-bold text-ocean-100">
          {tr(text.booking.date, language)}
          <input className="focus-ring min-w-0 w-full rounded-2xl border border-white/10 bg-ocean-900 px-3 py-3 text-sm text-white focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15 sm:px-4" type="date" value={props.date} onChange={(event) => props.onDateChange(event.target.value)} />
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-ocean-100">
          {tr(text.booking.guests, language)}
          <input className="focus-ring min-w-0 w-full rounded-2xl border border-white/10 bg-ocean-900 px-3 py-3 text-sm text-white focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15 sm:px-4" type="number" inputMode="numeric" min={1} max={props.effectiveMaxGuests} value={props.guests} onChange={(event) => props.onGuestsChange(Number(event.target.value))} />
          {props.hasCapacityError ? <span className="text-sm text-red-300">This boat has a maximum capacity of {props.effectiveMaxGuests} guests.</span> : null}
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
          <p className="flex items-start gap-2 text-sm font-bold sm:text-base"><Info size={18} className="mt-0.5 shrink-0 text-ocean-600" /> Your tour includes {props.includedGuests} guests.</p>
          <p className="mt-2 text-sm">{props.pricing.extraGuests} additional guests x {formatCurrency(props.extraGuestPrice)} = {formatCurrency(props.pricing.extraGuestsTotal)}</p>
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

function CustomerStep(props: {
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  bookingStatus: BookingStatus;
  canReview: boolean;
  onCustomerNameChange: (name: string) => void;
  onCustomerEmailChange: (email: string) => void;
  onCustomerWhatsappChange: (value: string) => void;
  onBack: () => void;
  onReview: () => void;
}) {
  const { language } = useLanguage();

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
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} placeholder="Juan Perez" autoComplete="name" />
          </span>
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          {tr(text.booking.email, language)}
          <span className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" type="email" value={props.customerEmail} onChange={(event) => props.onCustomerEmailChange(event.target.value)} placeholder="juan@email.com" autoComplete="email" spellCheck={false} />
          </span>
        </label>

        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
          {tr(text.booking.phone, language)}
          <span className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
            <input className="focus-ring w-full rounded-xl border border-white/10 bg-ocean-950/65 py-3 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-400 focus:ring-4 focus:ring-ocean-500/15" type="tel" inputMode="tel" value={props.customerWhatsapp} onChange={(event) => props.onCustomerWhatsappChange(event.target.value)} placeholder={DISPLAY_PHONE} autoComplete="tel" />
          </span>
        </label>
      </div>

      {props.bookingStatus === 'payment-link-requested' ? (
        <div className="mt-5 rounded-2xl border border-ocean-400/30 bg-ocean-500/10 p-4 text-ocean-100">
          <p className="font-bold">Payment link request ready</p>
          <p className="mt-1 text-sm">Complete the request in WhatsApp. Our team will send you the payment link.</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col-reverse gap-3 pt-7 sm:flex-row sm:justify-between">
        <Button type="button" variant="secondary" onClick={props.onBack}>
          ← {tr(text.booking.back, language)}
        </Button>
        <Button disabled={!props.canReview} type="button" onClick={props.onReview}>
          {tr(text.booking.confirm, language)}
        </Button>
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
  pricing: ReturnType<typeof calculateBookingTotal>;
}) {
  const { language } = useLanguage();
  const coverImage = props.selectedTour?.image ?? props.selectedBoat.image;
  const subtotal = props.selectedTour?.customQuote ? 'Custom quote' : formatCurrency(props.pricing.basePrice);
  const taxes = props.selectedTour?.customQuote ? '-' : formatCurrency(Math.max(props.pricing.total - props.pricing.basePrice - props.pricing.extraGuestsTotal, 0));

  return (
    <aside className="h-fit rounded-2xl border border-ocean-500/35 bg-white/[0.06] p-3 text-white shadow-soft backdrop-blur-xl min-[420px]:p-4 sm:p-4">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">{tr(text.booking.summary, language)}</p>
      <img src={coverImage} alt={props.selectedTour?.name ?? props.selectedBoat.name} className="mt-3 hidden aspect-[16/7] w-full rounded-2xl object-cover min-[520px]:block xl:aspect-[16/8]" loading="lazy" />
      <div className="mt-3 sm:mt-5">
        <h3 className="text-xl font-extrabold text-white">{props.selectedBoat.name}</h3>
        <p className="mt-1 text-sm font-semibold text-ocean-300">{props.selectedBoat.includedGuests} {tr(text.booking.people, language)} - {props.selectedBoat.length} - {props.selectedBoat.engine}</p>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-ocean-100">
        <SummaryRow label={tr(text.booking.tourType, language)} value={props.selectedTour ? `${props.selectedTour.name} (${props.selectedTour.duration}h)` : tr(text.booking.selectTour, language)} />
        <SummaryRow label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
        <SummaryRow label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot?.time ?? tr(text.booking.selectTime, language)} />
        <SummaryRow label={tr(text.booking.guests, language)} value={`${props.guests} ${tr(text.booking.people, language)}`} />
      </div>
      <div className="mt-4 rounded-2xl border border-ocean-500/25 bg-ocean-900/70 p-3 sm:mt-6 sm:p-4">
        <SummaryRow label="Subtotal" value={subtotal} />
        {props.pricing.extraGuests > 0 ? <SummaryRow label={tr(text.booking.extraPeople, language)} value={`${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)}`} /> : null}
        <SummaryRow label={tr(text.booking.taxes, language)} value={taxes} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
          <span className="font-extrabold text-white">Total</span>
          <span className="text-2xl font-extrabold text-ocean-400 sm:text-3xl">{props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total)}</span>
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-ocean-300">{tr(text.booking.secure, language)}</p>
    </aside>
  );
}

function BookingProgressSummary(props: {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  date: string;
  selectedTimeSlot?: { id: string; label: string; time: string };
  guests: number;
  pricing: ReturnType<typeof calculateBookingTotal>;
  activeStep: number;
}) {
  const { language } = useLanguage();
  const total = props.selectedTour?.customQuote ? 'Cotizar' : formatCurrency(props.pricing.total);

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
          <SummaryMini label={tr(text.booking.tourType, language)} value={props.selectedTour?.name ?? tr(text.booking.selectTour, language)} />
          <SummaryMini label={tr(text.booking.date, language)} value={formatDisplayDate(props.date)} />
          <SummaryMini label={language === 'es' ? 'Salida' : 'Departure'} value={props.selectedTimeSlot?.time ?? tr(text.booking.selectTime, language)} />
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
  customerName: string;
  customerEmail: string;
  customerWhatsapp: string;
  paymentMethod: string;
  pricing: ReturnType<typeof calculateBookingTotal>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ocean-950/70 px-3 py-4 backdrop-blur-sm sm:px-4">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-ocean-950 p-4 text-white shadow-lifted sm:rounded-[2rem] sm:p-8">
        <h3 className="text-3xl font-extrabold text-white">{props.paymentMethod === 'Payment link via WhatsApp' ? 'Request your payment link' : 'Review reservation'}</h3>
        <p className="mt-3 leading-7 text-ocean-200">
          {props.paymentMethod === 'Payment link via WhatsApp'
            ? 'Review your reservation details before sending the request. Our team will receive your booking information and send you a payment link through WhatsApp.'
            : 'Review your reservation details before confirming this request.'}
        </p>
        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
          <SummaryLine label="Boat" value={props.selectedBoat.name} />
          <SummaryLine label="Tour" value={props.selectedTour?.name ?? 'Not selected'} />
          <SummaryLine label="Date" value={formatDisplayDate(props.date)} />
          <SummaryLine label="Departure time" value={props.departure} />
          <SummaryLine label="Guests" value={String(props.guests)} />
          <SummaryLine label="Additional guest charges" value={props.pricing.extraGuests > 0 ? `${props.pricing.extraGuests} x ${formatCurrency(props.pricing.extraGuestPrice)} = ${formatCurrency(props.pricing.extraGuestsTotal)}` : '$0'} />
          <SummaryLine label="Total" value={props.pricing.isCustomQuote ? 'Custom quote' : formatCurrency(props.pricing.total)} />
          <SummaryLine label="Customer name" value={props.customerName} />
          <SummaryLine label="Email" value={props.customerEmail} />
          <SummaryLine label="WhatsApp number" value={props.customerWhatsapp} />
          <SummaryLine label="Payment method" value={props.paymentMethod} />
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={props.onBack}>
            Go Back
          </Button>
          <Button type="button" onClick={props.onConfirm}>
            {props.paymentMethod === 'Payment link via WhatsApp' ? 'Send via WhatsApp' : 'Confirm reservation'}
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
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span className="font-semibold text-ocean-300">{label}</span>
      <span className="text-right font-bold text-white">{value}</span>
    </div>
  );
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
