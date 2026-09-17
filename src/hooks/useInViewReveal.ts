import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Drives the "reveal on scroll into view" behavior for touch carousels
 * (BoatCard, BoatTourCard) — on a real trackpad/mouse the hover/focus CSS
 * already handles the reveal, but a phone has no hover, so the card that's
 * actually snapped into view in the carousel activates it on its own
 * instead of requiring a tap. `rootRef` should be the carousel's own
 * horizontally-scrolling container — without it, IntersectionObserver
 * falls back to the page viewport, which would mark every card in the row
 * as "in view" at once (they're only hidden by the carousel's own
 * `overflow-x`, not out of the page's viewport). The CSS gates this to
 * `@media (hover: none)`, so it never fires on a real hover-capable
 * device — this hook itself doesn't need to know which one it's on.
 */
export function useInViewReveal<T extends HTMLElement>(rootRef?: RefObject<HTMLElement | null>) {
  const targetRef = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { root: rootRef?.current ?? null, threshold: 0.6 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [rootRef]);

  return { targetRef, isInView };
}
