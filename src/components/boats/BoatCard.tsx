import { Users } from 'lucide-react';

import type { Boat } from '../../types/boat';
import { useLanguage } from '../../i18n/LanguageContext';
import { CardActions, CardShell, PriceLabel } from '../ui';

interface BoatCardProps {
  boat: Boat;
  startingPrice: number;
  isSelected: boolean;
  onSelect: (boat: Boat) => void;
}

// Immersive, full-bleed photo card — same pattern as BoatTourCard (see
// .media-card-content/.media-card-reveal in index.css): at rest only the
// name shows, pinned near the bottom; price, max-guests pill and CTA sit
// below it, revealed by sliding the whole block up on hover/focus/tap.
// Length and engine (still real fields on `boat`/`boatText`, untouched)
// aren't shown on this card anymore — they were never in the list of
// what this redesign keeps visible here, same as Tours dropping its
// description/specs paragraph without touching the underlying data.
export function BoatCard({ boat, startingPrice, isSelected, onSelect }: BoatCardProps) {
  const { language } = useLanguage();

  return (
    <article className="card-shadow-pool h-full w-full">
      <CardShell
        as="button"
        aria-label={`${language === 'es' ? 'Ver barco' : 'Explore boat'} ${boat.name}`}
        className="card-shell-soft group relative h-72 sm:h-80"
        interactive
        onClick={() => onSelect(boat)}
        selected={isSelected}
        type="button"
      >
        <img
          alt={boat.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          loading="lazy"
          src={boat.image}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(5,24,40,0.92) 0%, rgba(5,24,40,0.66) 35%, rgba(5,24,40,0.2) 70%, transparent 100%)' }}
        />
        <span className="media-card-content absolute inset-x-0 bottom-0 z-10 p-4 text-left">
          <span className="font-display line-clamp-2 text-lg font-semibold leading-tight text-white sm:text-xl">{boat.name}</span>
          <span className="media-card-reveal mt-2 flex flex-col items-start gap-2">
            <PriceLabel label={language === 'es' ? 'Desde' : 'From'} value={formatStartingPrice(startingPrice)} />
            <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] glass-control px-2.5 py-1 text-[0.65rem] font-medium text-ocean-100">
              <Users aria-hidden="true" className="size-3 shrink-0 text-ocean-300" strokeWidth={2} />
              {language === 'es' ? `Máx. ${boat.maxGuests}` : `Max ${boat.maxGuests} guests`}
            </span>
            <CardActions className="mt-0.5">{language === 'es' ? 'Ver barco' : 'Explore Boat'}</CardActions>
          </span>
        </span>
      </CardShell>
    </article>
  );
}

function formatStartingPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
