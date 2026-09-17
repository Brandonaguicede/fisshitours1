import { ArrowRight, CheckCircle2, Clock, MapPin, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { getBoatStartingPrice, getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { cn } from '../../utils/cn';
import { reveal, revealBlur } from '../common/SectionReveal';
import { Button } from '../ui';

interface BookingTeaserProps {
  selectedBoat: Boat;
  selectedTour?: BoatTour;
  tours: BoatTour[];
}

const steps = [
  { icon: MapPin, es: { title: 'Elige tu bote', sub: 'Selecciona tu embarcación' }, en: { title: 'Choose your boat', sub: 'Select your vessel' } },
  { icon: SlidersHorizontal, es: { title: 'Personaliza tu tour', sub: 'Define fechas y actividades' }, en: { title: 'Customize your tour', sub: 'Set dates and activities' } },
  { icon: CheckCircle2, es: { title: 'Confirma', sub: 'Revisa y asegura tu reserva' }, en: { title: 'Confirm', sub: 'Review and secure your booking' } },
];

// Cinematic boarding-pass ticket: photo / info, 2 zones only, with the 3
// booking steps living outside the ticket as their own row — full flow at /reservar.
export function BookingTeaser({ selectedBoat, selectedTour, tours }: BookingTeaserProps) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const tourText = selectedTour ? getTourText(selectedTour, language) : null;
  const price = selectedTour ? selectedTour.basePrice : getBoatStartingPrice(selectedBoat.id, tours);
  const effectiveGuests = selectedTour ? getEffectiveMaxGuests(selectedBoat, selectedTour) : undefined;
  const tourTitle = tourText ? tourText.title : tr(text.home.bookingNoSelection, language);

  return (
    <div {...revealBlur(1)}>
      {/* Steps — external, above the ticket: linear progress, not columns */}
      <div className="mx-auto mb-7 max-w-[620px] lg:max-w-[660px] [@media(min-width:1024px)_and_(max-height:800px)]:mb-4" {...reveal(1.2)}>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-9 right-[66.667%] top-[18px] hidden h-px bg-gradient-to-r from-white/10 via-white/25 to-white/10 sm:block" />
          <span aria-hidden="true" className="pointer-events-none absolute left-[calc(33.333%_+_2.25rem)] right-[33.333%] top-[18px] hidden h-px bg-gradient-to-r from-white/10 via-white/25 to-white/10 sm:block" />
          <div className="relative z-10 grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-y-0">
            {steps.map((step, index) => {
              const copy = language === 'es' ? step.es : step.en;
              return (
                <div className="flex items-center gap-2.5 py-2 sm:py-0" key={copy.title}>
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border sm:size-9',
                      index === 0 ? 'border-ocean-200/70 bg-white/10 text-white' : 'border-white/20 text-ocean-200/70',
                    )}
                  >
                    <step.icon aria-hidden="true" size={13} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.05em] text-white/85 sm:text-[0.66rem]">
                      {index + 1}. {copy.title}
                    </p>
                    <p className="mt-0.5 text-[0.6rem] leading-snug text-ocean-200/60">{copy.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ticket */}
      <div className="card-shadow-pool mx-auto max-w-[1050px] lg:max-w-[1100px] [@media(min-width:1024px)_and_(max-height:800px)]:max-w-[720px]">
        <div className="booking-teaser-notch-mask relative overflow-hidden rounded-[30px] border border-white/25 bg-ocean-950">
          <div className="grid grid-cols-1 sm:grid-cols-[50%_50%] [@media(min-width:1024px)_and_(min-height:801px)]:aspect-[2.8/1]">
            {/* Zone A — photo, full bleed */}
            <div className="relative h-52 overflow-hidden sm:h-full">
              <img
                alt={selectedBoat.name}
                className="absolute inset-0 h-full w-full object-cover object-[50%_38%]"
                loading="lazy"
                src={selectedBoat.image}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(11,40,66,0.92) 0%, rgba(11,40,66,0.58) 24%, rgba(11,40,66,0.06) 48%, rgba(11,40,66,0.32) 100%)' }}
              />
              <div className="absolute inset-x-3 bottom-2 max-w-[75%] sm:inset-x-4 sm:bottom-3 [@media(min-width:1024px)_and_(max-height:800px)]:bottom-1.5">
                <p className="font-display text-base italic leading-snug text-white/95 sm:text-lg">
                  {language === 'es' ? (
                    <>
                      Más que un tour,
                      <br />una mejor forma de vivir el día.
                    </>
                  ) : (
                    <>
                      More than a tour,
                      <br />a better kind of day.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Zone B — info panel: a hair lighter than bg-ocean-950 (the
                page's own background) so the panel reads as its own block
                instead of blending into whatever sits behind the card. */}
            <div className="relative flex min-w-0 flex-col justify-center overflow-hidden bg-ocean-900 px-5 py-6 sm:pl-10 sm:pr-10 [@media(min-width:1024px)_and_(max-height:800px)]:py-3.5">
            <div className="max-w-full text-center sm:max-w-[300px] sm:self-start sm:mx-auto">
              <p className="truncate text-center text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ocean-300">{selectedBoat.name}</p>
              <h3 className="mt-1 line-clamp-2 font-display text-[1.6rem] font-bold leading-[1.1] text-white sm:text-[2rem] [@media(min-width:1024px)_and_(max-height:800px)]:mt-1 [@media(min-width:1024px)_and_(max-height:800px)]:text-[1.4rem]">{tourTitle}</h3>

              {tourText ? (
                <div className="mt-2 flex items-center justify-center gap-3 text-xs text-ocean-100 [@media(min-width:1024px)_and_(max-height:800px)]:mt-1">
                  {selectedTour?.duration ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock aria-hidden="true" className="text-ocean-300" size={13} strokeWidth={2} />
                      {selectedTour.duration} {language === 'es' ? 'horas' : 'hours'}
                    </span>
                  ) : null}
                  {effectiveGuests ? (
                    <>
                      <span aria-hidden="true" className="h-3.5 w-px bg-white/20" />
                      <span className="inline-flex items-center gap-1.5">
                        <Users aria-hidden="true" className="text-ocean-300" size={13} strokeWidth={2} />
                        {language === 'es' ? `Hasta ${effectiveGuests} personas` : `Up to ${effectiveGuests} guests`}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}

              <span aria-hidden="true" className="mt-3.5 block h-px w-full bg-white/15 [@media(min-width:1024px)_and_(max-height:800px)]:mt-2" />

              <div className="mt-3 flex items-baseline justify-center gap-2 [@media(min-width:1024px)_and_(max-height:800px)]:mt-2">
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ocean-300">{language === 'es' ? 'Desde' : 'From'}</span>
                <span className="font-display text-2xl font-extrabold leading-none text-white sm:text-3xl [@media(min-width:1024px)_and_(max-height:800px)]:text-xl">{formatCurrency(price)}</span>
              </div>

              <div className="mt-3 flex justify-center [@media(min-width:1024px)_and_(max-height:800px)]:mt-2">
                <Button
                  className="w-[68%] [@media(min-width:1024px)_and_(max-height:800px)]:min-h-0 [@media(min-width:1024px)_and_(max-height:800px)]:py-1"
                  onClick={() => navigate('/reservar')}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  {tr(text.booking.startBooking, language)}
                  <ArrowRight aria-hidden="true" size={14} />
                </Button>
              </div>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[0.62rem] text-ocean-200/80 [@media(min-width:1024px)_and_(max-height:800px)]:mt-1.5">
                <ShieldCheck aria-hidden="true" size={12} />
                {tr(text.home.bookingHelper, language)}
              </p>
            </div>
            </div>
          </div>

          {/* Perforation A/B — direct children of this wrapper (not nested in
              either zone), fully self-positioned via CSS; see index.css. */}
          <div aria-hidden="true" className="booking-teaser-divider-h" />
          <div aria-hidden="true" className="booking-teaser-divider-v" />
        </div>
      </div>
    </div>
  );
}
