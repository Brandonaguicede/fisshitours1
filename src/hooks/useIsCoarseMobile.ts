import { useEffect, useState } from 'react';

const QUERY = '(hover: none) and (max-width: 559px)';

/**
 * True only for touch devices at mobile width (<560px) — the one range
 * where a real hover/focus reveal is never reachable at all, so the
 * carousel card actually scrolled into view should activate on its own.
 * Deliberately excludes tablet: it's also a touch device, but shows 2
 * cards at once, so auto-activating on scroll there would let both be
 * "in view" simultaneously — exactly the multi-active bug this is meant
 * to avoid.
 */
export function useIsCoarseMobile() {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQueryList = window.matchMedia(QUERY);
    const update = () => setMatches(mediaQueryList.matches);
    update();
    mediaQueryList.addEventListener('change', update);
    return () => mediaQueryList.removeEventListener('change', update);
  }, []);

  return matches;
}
