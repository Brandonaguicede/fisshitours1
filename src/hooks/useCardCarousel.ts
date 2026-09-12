import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared scroll-snap carousel controller for a horizontally-scrolling row of
 * fixed- or percentage-width cards (Boats, Tours). Tracks left/right
 * availability precisely from real card offsets instead of a fraction of the
 * container width, so a step always lands exactly on a card boundary.
 */
export function useCardCarousel<T>(items: T[]) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateControls = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const maximumScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft < maximumScroll - 2);
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    updateControls();
    const observer = new ResizeObserver(updateControls);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length, updateControls]);

  const scrollByCards = useCallback((direction: 'left' | 'right', cardsPerStep: number) => {
    const element = scrollerRef.current;
    if (!element) return;
    const step = getCardStep(element);
    if (!step) {
      element.scrollBy({ left: direction === 'right' ? element.clientWidth : -element.clientWidth, behavior: 'smooth' });
      return;
    }
    const maximumScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    const currentIndex = Math.round(element.scrollLeft / step);
    const targetLeft = direction === 'right'
      ? Math.min(currentIndex * step + cardsPerStep * step, maximumScroll)
      : Math.max(currentIndex * step - cardsPerStep * step, 0);
    element.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, []);

  return { scrollerRef, canScrollLeft, canScrollRight, updateControls, scrollByCards };
}

function getCardStep(element: HTMLDivElement) {
  const firstCard = element.children.item(0) as HTMLElement | null;
  const secondCard = element.children.item(1) as HTMLElement | null;
  if (!firstCard) return 0;
  return secondCard ? secondCard.offsetLeft - firstCard.offsetLeft : firstCard.offsetWidth;
}

/**
 * Cards-per-view for the shared 1 / 2 / 3 carousel layout (matches the
 * `sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]` card-width
 * classes both carousels use — the Tailwind `sm`/`lg` breakpoints here are
 * the same tokens the CSS itself reads, not independent guesses).
 */
export function getVisibleCardCount() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}
