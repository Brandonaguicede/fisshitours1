import { Compass, Clock, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

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
      <article className="h-full w-full">
        <button
          className={`focus-ring glass-surface glass-interactive group flex h-full w-full appearance-none flex-col overflow-hidden rounded-[1.65rem] p-0 text-left ${
            isSelected ? 'ring-1 ring-inset ring-ocean-200/45' : ''
          }`}
          type="button"
          aria-label={`${language === 'es' ? 'Ver tour' : 'View tour'} ${display.title}`}
          onClick={openModal}
        >
          <span className="relative block h-48 w-full shrink-0 overflow-hidden bg-ocean-900 sm:h-52">
            <img
              src={tour.image}
              alt={language === 'es' ? `Tour ${display.title} a bordo de ${boat.name}` : `${display.title} tour aboard ${boat.name}`}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              loading="lazy"
              decoding="async"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-transparent to-ocean-950/10" />
            <span className="absolute inset-x-5 bottom-4">
              <span className="block font-display text-[1.75rem] font-semibold leading-none text-white">{display.title}</span>
            </span>
          </span>

          <span className="flex w-full flex-1 flex-col p-4 sm:p-5">
            <span className="text-sm font-semibold text-ocean-200">
              {language === 'es' ? 'Desde' : 'From'} {formatTourPrice(lowestPrice)}
            </span>

            <span className="mt-4 grid grid-cols-3 gap-2">
              <TourSpecChip icon={<Clock size={15} />} value={getDurationLabel(tour, display.duration, language)} />
              <TourSpecChip icon={<Users size={15} />} value={`${language === 'es' ? 'MÃ¡x.' : 'Max'} ${effectiveMaxGuests}`} />
              <TourSpecChip icon={<Compass size={15} />} value={display.category} />
            </span>

            <span className="glass-primary glass-interactive mt-4 flex min-h-10 w-full items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-ocean-950">
              {language === 'es' ? 'Ver tour' : 'View Tour'}
            </span>
          </span>
        </button>
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

function TourSpecChip({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="glass-control flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-center text-[0.7rem] font-medium leading-tight text-ocean-100">
      <span className="text-ocean-400">{icon}</span>
      <span className="w-full truncate">{value}</span>
    </span>
  );
}

function formatTourPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getDurationLabel(tour: BoatTour, localizedDuration: string | undefined, language: 'en' | 'es') {
  if (localizedDuration) return localizedDuration;
  const slot = tour.timeSlots[0];
  if (!slot) return language === 'es' ? 'Consultar' : 'On request';
  return slot.time;
}
