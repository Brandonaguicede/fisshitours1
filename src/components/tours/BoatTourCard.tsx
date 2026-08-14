import { CheckCircle, Clock, Info, Users, X } from 'lucide-react';
import { useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getEffectiveMaxGuests, getTourIncludedGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button } from '../common/Button';

interface BoatTourCardProps {
  boat: Boat;
  tour: BoatTour;
  isSelected: boolean;
  onSelect: (tour: BoatTour) => void;
}

export function BoatTourCard({ boat, tour, isSelected, onSelect }: BoatTourCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const includedGuests = getTourIncludedGuests(boat, tour);
  const effectiveMaxGuests = getEffectiveMaxGuests(boat, tour);

  return (
    <>
      <article className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-400/70 ${isSelected ? 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10' : ''}`}>
        <div className="relative overflow-hidden">
          <img
            src={tour.image}
            alt={tour.name}
            className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ocean-950/70 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-ocean-950/75 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-ocean-100 shadow-sm backdrop-blur-xl">{tour.category}</span>
            <span className="rounded-full bg-ocean-900/80 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.08em] text-white shadow-sm">{boat.name}</span>
          </div>
          {isSelected ? (
            <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-ocean-400 text-ocean-950 shadow-sm">
              <CheckCircle size={20} />
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h3 className="text-balance text-2xl font-extrabold leading-tight text-white">{tour.name}</h3>
          <p className="mt-2 text-sm font-bold text-ocean-400">Aboard {boat.name}</p>
          <div className="mt-4 grid gap-2 text-sm font-semibold text-ocean-200">
            <span className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2">
              <Clock size={16} className="text-ocean-400" />
              {tour.duration} Hours
            </span>
            <span className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2">
              <Users size={16} className="text-ocean-400" />
              <span>{includedGuests} guests included - max {effectiveMaxGuests}</span>
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-4 pt-6 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-300">From</p>
              <p className="text-2xl font-extrabold leading-tight text-ocean-400">{tour.customQuote ? 'Custom quote' : formatCurrency(tour.basePrice)}</p>
            </div>
            <div className="grid w-full gap-2 min-[520px]:w-auto min-[520px]:justify-items-end">
              <Button type="button" variant="secondary" className="min-h-10 w-full px-4 min-[520px]:w-auto" onClick={() => setIsModalOpen(true)}>
                <Info size={16} />
                Quick View
              </Button>
              <Button type="button" className="w-full min-[520px]:w-auto" onClick={() => onSelect(tour)}>
                Select Tour
              </Button>
            </div>
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
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
              <div className="absolute bottom-5 left-5 right-5">
                <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-ocean-200">{boat.name}</p>
                <h3 className="mt-1 text-3xl font-extrabold text-white">{tour.name}</h3>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <p className="text-base leading-7 text-ocean-200">{tour.description}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">Duration</p>
                  <p className="mt-1 font-extrabold text-white">{tour.duration} Hours</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">Guests</p>
                  <p className="mt-1 font-extrabold text-white">{includedGuests} included</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">From</p>
                  <p className="mt-1 font-extrabold text-ocean-400">{tour.customQuote ? 'Custom quote' : formatCurrency(tour.basePrice)}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    onSelect(tour);
                  }}
                >
                  Select Tour
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
