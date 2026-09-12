import { ArrowRight, Clock, MapPin, SlidersHorizontal, CheckCircle2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { getBoatStartingPrice, getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { reveal, revealBlur } from '../common/SectionReveal';
import { Button, GlassPanel } from '../ui';

interface BookingTeaserProps {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  tours: BoatTour[];
}

const steps = [
  { icon: MapPin, es: 'Elige bote', esSub: 'Selecciona tu embarcación', en: 'Choose your boat', enSub: 'Select your vessel' },
  { icon: SlidersHorizontal, es: 'Personaliza tu tour', esSub: 'Define fechas y actividades', en: 'Customize your tour', enSub: 'Set dates and activities' },
  { icon: CheckCircle2, es: 'Confirma', esSub: 'Revisa y asegura tu reserva', en: 'Confirm', enSub: 'Review and secure your booking' },
];

// Wide glass card by design, not a vertical product card — full flow lives at /reservar.
export function BookingTeaser({ selectedBoat, selectedTour, tours }: BookingTeaserProps) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const tourText = selectedTour ? getTourText(selectedTour, language) : null;
  const price = selectedTour ? selectedTour.basePrice : getBoatStartingPrice(selectedBoat.id, tours);
  const effectiveGuests = selectedTour ? getEffectiveMaxGuests(selectedBoat, selectedTour) : undefined;

  return (
    <GlassPanel className="mx-auto max-w-3xl p-8 sm:p-9 lg:p-10" variant="panel" {...revealBlur(1)}>
      <div className="relative [--step-r:1.25rem] lg:[--step-r:1.375rem]" {...reveal(1.2)}>
        {/* Two segments (not one full-width line) so the connector runs only in the
            gap between bubbles and never passes behind/through either circle. */}
        <span aria-hidden="true" className="pointer-events-none absolute top-5 left-[calc(16.6667%_+_var(--step-r))] right-[calc(50%_+_var(--step-r))] z-0 h-px bg-gradient-to-r from-white/5 via-white/20 to-white/5 lg:top-[22px]" />
        <span aria-hidden="true" className="pointer-events-none absolute top-5 left-[calc(50%_+_var(--step-r))] right-[calc(16.6667%_+_var(--step-r))] z-0 h-px bg-gradient-to-r from-white/5 via-white/20 to-white/5 lg:top-[22px]" />
        <div className="relative z-10 grid grid-cols-3">
          {steps.map((step, index) => (
            <div className="flex flex-col items-center gap-1.5 px-1 text-center" key={step.en}>
              <GlassPanel as="span" className="grid size-10 shrink-0 place-items-center text-ocean-200 lg:size-11" shape="circle" variant={index === 0 ? 'active' : 'control'}>
                <step.icon aria-hidden="true" size={17} />
              </GlassPanel>
              <span className="text-[0.62rem] font-bold uppercase leading-tight tracking-[0.06em] text-ocean-300 sm:text-[0.68rem]">
                {language === 'es' ? step.es : step.en}
              </span>
              <span className="text-[0.6rem] leading-tight text-ocean-400/80 sm:text-[0.65rem]">
                {language === 'es' ? step.esSub : step.enSub}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-5" {...reveal(2.1)}>
        <GlassPanel
          className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
          style={{ borderColor: 'rgba(221, 239, 246, 0.14)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)' }}
          variant="subtle"
        >
          <img
            alt={selectedBoat.name}
            className="h-40 w-full shrink-0 rounded-[var(--radius-panel)] object-cover sm:h-36 sm:w-44 lg:h-40 lg:w-56"
            loading="lazy"
            src={selectedBoat.image}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold uppercase tracking-[0.1em] text-ocean-400">{selectedBoat.name}</p>
            <h3 className="mt-1 line-clamp-2 font-display text-xl font-bold leading-tight text-white sm:text-2xl">
              {tourText ? tourText.title : tr(text.home.bookingNoSelection, language)}
            </h3>
            {tourText ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ocean-200">
                {selectedTour?.duration ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock aria-hidden="true" className="text-ocean-400" size={14} strokeWidth={2} />
                    {`${selectedTour.duration}h`}
                  </span>
                ) : null}
                {effectiveGuests ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users aria-hidden="true" className="text-ocean-400" size={14} strokeWidth={2} />
                    {language === 'es' ? `Hasta ${effectiveGuests}` : `Up to ${effectiveGuests}`}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex items-baseline gap-2 border-t border-white/10 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-ocean-300">{language === 'es' ? 'Desde' : 'From'}</span>
              <span className="font-display text-xl font-extrabold text-white sm:text-2xl">{formatCurrency(price)}</span>
            </div>
          </div>
        </GlassPanel>
      </div>

      <div className="mt-5 flex justify-center" {...reveal(2.4)}>
        <Button className="w-full sm:w-[90%] lg:w-[88%]" onClick={() => navigate('/reservar')} size="lg" type="button">
          {tr(text.booking.startBooking, language)}
          <ArrowRight aria-hidden="true" size={16} />
        </Button>
      </div>
      <p className="mt-1.5 text-center text-xs text-ocean-300" {...reveal(2.6)}>
        {tr(text.home.bookingHelper, language)}
      </p>
    </GlassPanel>
  );
}
