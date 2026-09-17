import { Users } from 'lucide-react';
import { useEffect } from 'react';
import type { RefObject } from 'react';

import type { Boat } from '../../types/boat';
import { useLanguage } from '../../i18n/LanguageContext';
import { useInViewReveal } from '../../hooks/useInViewReveal';
import { useIsCoarseMobile } from '../../hooks/useIsCoarseMobile';
import { cn } from '../../utils/cn';
import { CardActions, CardShell, PriceLabel } from '../ui';

interface BoatCardProps {
  boat: Boat;
  startingPrice: number;
  isSelected: boolean;
  isActive: boolean;
  onActiveChange: (boatId: string, active: boolean) => void;
  onSelect: (boat: Boat) => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

// Immersive, full-bleed photo card — same pattern as BoatTourCard (see
// .media-card-content/.media-card-reveal in index.css): at rest only the
// name shows, pinned near the bottom; price, max-guests pill and CTA sit
// below it, revealed by sliding the whole block up on hover/focus/tap/
// active. Length and engine (still real fields on `boat`/`boatText`,
// untouched) aren't shown on this card anymore — they were never in the
// list of what this redesign keeps visible here, same as Tours dropping
// its description/specs paragraph without touching the underlying data.
//
// CardShell is a plain div here, not a button — clicking the card only
// toggles the reveal (`.is-active`, see index.css), it never opens the
// modal. Opening the modal is the CTA's job alone, a real nested <button>
// (valid now that CardShell isn't a button itself), so it stays reachable
// on its own via mouse, tap or keyboard Tab regardless of whether the
// card around it is "peeking" or not.
//
// `isActive` is controlled by the parent carousel section, not local
// state — one shared "which card is active" value per carousel, so
// activating this card is guaranteed to deactivate whichever other card
// held it (see FleetSection).
export function BoatCard({ boat, startingPrice, isSelected, isActive, onActiveChange, onSelect, scrollRootRef }: BoatCardProps) {
  const { language } = useLanguage();
  const isCoarseMobile = useIsCoarseMobile();
  // Touch has no real hover — on mobile (<560px) only, the card that's
  // actually scrolled into view in the carousel reveals on its own
  // instead of requiring a tap. Never on tablet (also touch, but shows 2
  // cards at once — both could cross the "in view" threshold together).
  const { targetRef, isInView } = useInViewReveal<HTMLElement>(scrollRootRef);

  useEffect(() => {
    if (isCoarseMobile) onActiveChange(boat.id, isInView);
  }, [isCoarseMobile, isInView, onActiveChange, boat.id]);

  return (
    <article className="card-shadow-pool h-full w-full" ref={targetRef}>
      <CardShell
        className={cn('card-shell-soft group relative h-72 sm:h-80', isActive && 'is-active')}
        interactive
        onClick={() => onActiveChange(boat.id, !isActive)}
        selected={isSelected}
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
            <CardActions aria-label={`${language === 'es' ? 'Ver barco' : 'Explore boat'} ${boat.name}`} className="mt-0.5" onClick={(event) => { event.stopPropagation(); onSelect(boat); }}>
              {language === 'es' ? 'Ver barco' : 'Explore Boat'}
            </CardActions>
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
