import { ArrowRight, CheckCircle, Clock, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getPackageLabel, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button } from '../common/Button';

interface BoatTourCardProps {
  boat: Boat;
  tour: BoatTour;
  relatedTours?: BoatTour[];
  isSelected: boolean;
  onSelect: (tour: BoatTour) => void;
}

function getLowestPrice(tours: BoatTour[]) {
  return Math.min(...tours.map((item) => item.basePrice));
}

export function BoatTourCard({ boat, tour, relatedTours, isSelected, onSelect }: BoatTourCardProps) {
  const { language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const packageTours = relatedTours?.length ? relatedTours : [tour];
  const display = getTourText(tour, language);
  const effectiveMaxGuests = getEffectiveMaxGuests(boat, tour);
  const lowestPrice = getLowestPrice(packageTours);

  function openModal() {
    openerRef.current = document.activeElement as HTMLElement | null;
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!isModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isModalOpen]);

  return (
    <>
      <article className={`group relative flex h-full min-h-[335px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-400/70 hover:shadow-lifted sm:min-h-[380px] ${isSelected ? 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10' : ''}`}>
        <div className="relative h-[185px] overflow-hidden sm:h-[215px]">
          <img
            src={tour.image}
            alt={language === 'es' ? `Tour ${display.title} a bordo de ${boat.name}` : `${display.title} tour aboard ${boat.name}`}
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
            loading="lazy"
          />
          {isSelected ? (
            <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-ocean-400 text-ocean-950 shadow-sm">
              <CheckCircle size={20} />
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-3.5 sm:p-4">
          <h3 className="text-balance text-xl font-extrabold leading-tight text-white sm:text-2xl">{display.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {display.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-ocean-400/25 bg-ocean-500/10 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.06em] text-ocean-200 sm:px-2.5 sm:py-1 sm:text-[0.68rem]">{tag}</span>
            ))}
          </div>
          <div className="mt-2.5 grid gap-1 text-xs font-semibold text-ocean-200 sm:mt-3 sm:gap-1.5 sm:text-sm">
            {display.duration ? <span className="flex items-center gap-2"><Clock size={16} className="text-ocean-400" /> {display.duration}</span> : null}
            <span className="flex items-center gap-2"><Users size={16} className="text-ocean-400" /> {language === 'es' ? `Hasta ${effectiveMaxGuests} personas` : `Up to ${effectiveMaxGuests} guests`}</span>
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-3 sm:pt-4">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ocean-300">{language === 'es' ? 'Desde' : 'From'}</p>
              <p className="text-xl font-extrabold leading-tight text-ocean-400 sm:text-2xl">{formatCurrency(lowestPrice)}</p>
            </div>
            <Button type="button" variant="secondary" className="group/button min-h-9 shrink-0 px-3 text-xs sm:min-h-10 sm:px-4 sm:text-sm" onClick={openModal}>
              {language === 'es' ? 'Ver Tour' : 'View Tour'}
              <ArrowRight size={16} className="transition-transform duration-300 group-hover/button:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </article>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-ocean-950/65 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8" role="dialog" aria-modal="true" aria-label={`${tour.name} details`}>
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-ocean-950 shadow-lifted">
            <div className="relative">
              <img src={tour.image} alt={tour.name} className="h-56 w-full object-cover sm:h-64" />
              <div className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-ocean-950/20 to-transparent" />
              <button
                className="focus-ring absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/15"
                type="button"
                aria-label="Close tour details"
                onClick={closeModal}
              >
                <X size={18} />
              </button>
              <div className="absolute bottom-5 left-5 right-5">
                <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-ocean-200">{boat.name}</p>
                <h3 className="mt-1 text-3xl font-extrabold text-white">{display.title}</h3>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <p className="text-base leading-7 text-ocean-200">{tour.description}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Actividades' : 'Activities'}</p>
                  <p className="mt-1 font-extrabold text-white">{display.activities.slice(0, 3).join(', ')}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Capacidad' : 'Capacity'}</p>
                  <p className="mt-1 font-extrabold text-white">{language === 'es' ? `Hasta ${effectiveMaxGuests} personas` : `Up to ${effectiveMaxGuests} guests`}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Persona extra' : 'Additional guest'}</p>
                  <p className="mt-1 font-extrabold text-ocean-400">{formatCurrency(tour.extraGuestPrice ?? boat.extraGuestPrice)} {language === 'es' ? 'cada una' : 'each'}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Incluye' : 'Included'}</p>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-ocean-200">
                    {display.included.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Precios' : 'Prices'}</p>
                  <div className="mt-3 grid gap-2">
                    {packageTours.map((item) => (
                      <div key={item.id} className="flex justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                        <span className="font-semibold text-ocean-200">{getPackageLabel(item, language)}</span>
                        <span className="font-extrabold text-ocean-400">{formatCurrency(item.basePrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  {language === 'es' ? 'Cerrar' : 'Close'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    closeModal();
                    onSelect(tour);
                  }}
                >
                  {language === 'es' ? 'Reservar' : 'Reserve'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
