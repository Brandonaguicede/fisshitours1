import { ArrowRight, Ship } from 'lucide-react';
import { useState } from 'react';
import type { BoatTour } from '../../types/boatTour';
import type { TourCatalogItem } from '../../utils/tourCatalog';
import { getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { CardActions, CardShell, PriceLabel } from '../ui';
import { TourDetailModal } from './TourDetailModal';

interface BoatTourCardProps {
  catalogItem: TourCatalogItem;
  isSelected: boolean;
  onSelect: (tour: BoatTour) => void;
}

// Immersive, full-bleed photo card — only what's needed to pick a tour
// (name, starting price, boat count, and the action to see the rest). All
// the detail this card used to spell out (description, specs paragraph)
// still lives one tap away in TourDetailModal; nothing here was removed
// from the data, only from what this card renders. At rest only the
// title shows, pinned near the bottom; the boats-available pill, price
// and CTA sit below it, pushed out of the card's own `overflow-hidden`
// box and revealed by sliding the whole block up on hover/focus/tap (no
// leftover prop from the old fixed-height photo-strip layout — a stray
// `mediaClassName="lg:h-28"` at the call site is what used to cap the
// image at 112px tall on desktop and leave the rest of the card showing
// its own glass background, i.e. the "big blue block" bug).
export function BoatTourCard({ catalogItem, isSelected, onSelect }: BoatTourCardProps) {
  const { language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const { tour, boatOptions, fromPrice } = catalogItem;
  const display = getTourText(tour, language);
  const boatCount = new Set(boatOptions.map((option) => option.boat.id)).size;
  const boatsAvailableLabel = boatCount + (language === 'es' ? (boatCount === 1 ? ' bote disponible' : ' botes disponibles') : (boatCount === 1 ? ' boat available' : ' boats available'));

  return <>
    <article className="card-shadow-pool h-full w-full">
      <CardShell as="button" aria-label={(language === 'es' ? 'Ver tour ' : 'View tour ') + display.title}
        className="card-shell-soft group relative h-72 sm:h-80" interactive onClick={() => { setModalSession((session) => session + 1); setIsModalOpen(true); }} selected={isSelected} type="button">
        <img
          alt={display.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          loading="lazy"
          src={tour.tourDetails?.image ?? tour.image}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(5,24,40,0.92) 0%, rgba(5,24,40,0.66) 35%, rgba(5,24,40,0.2) 70%, transparent 100%)' }}
        />
        <span className="media-card-content absolute inset-x-0 bottom-0 z-10 p-4 text-left">
          <span className="font-display line-clamp-2 text-lg font-semibold leading-tight text-white sm:text-xl">{display.title}</span>
          {/* Pill + price + CTA reveal together, on hover/focus/tap only —
              see .media-card-content/.media-card-reveal in index.css
              (shared with BoatCard). No `@media(hover)` branching:
              `:hover` never sticks on touch, and tapping this card (a
              real <button>) already triggers `:focus`, so the same rules
              serve mouse, touch and keyboard. */}
          <span className="media-card-reveal mt-2 flex flex-col items-start gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] glass-control px-2.5 py-1 text-[0.65rem] font-medium text-ocean-100">
              <Ship aria-hidden="true" className="size-3 shrink-0 text-ocean-300" strokeWidth={2} />
              {boatsAvailableLabel}
            </span>
            <PriceLabel label={language === 'es' ? 'Desde' : 'From'} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fromPrice)} />
            <CardActions className="mt-0.5">
              {language === 'es' ? 'Ver tour' : 'View Tour'}
              <ArrowRight aria-hidden="true" size={14} />
            </CardActions>
          </span>
        </span>
      </CardShell>
    </article>
    <TourDetailModal key={modalSession} boat={boatOptions[0].boat} boatOptions={boatOptions} tour={tour}
      packageTours={[]} open={isModalOpen} onClose={() => setIsModalOpen(false)} onSelect={onSelect} />
  </>;
}
