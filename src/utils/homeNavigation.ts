const DEFAULT_SAFE_HEADER = 96;

function readToken(name: string, fallback: number) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export function getSafeHeaderHeight() {
  return readToken('--header-safe-height', DEFAULT_SAFE_HEADER);
}

/**
 * The floating navbar sits *over* the page rather than pushing it down, so
 * "clearance" is not a scroll offset — it's space reserved *inside* each
 * section's own layout (its CSS padding-top + an inner centering wrapper),
 * see `lg:pt-[104px]` on the six navigable sections. The scroll target's
 * only job is to put the section's own physical top at the real viewport
 * top (`sectionRect.top === 0`). Landing anywhere lower than that — even by
 * exactly the navbar's height — leaves a strip of the *previous* section
 * sitting behind/above the floating navbar, which is the bug this function
 * exists to prevent. Since every navigable section carries `lg:min-h-[100svh]`,
 * this same rule also keeps the *next* section from showing on desktop: the
 * section already fills at least one viewport, so there's nothing beyond it
 * to reveal.
 */
function computeSectionTarget(section: HTMLElement) {
  const sectionRect = section.getBoundingClientRect();
  const sectionDocTop = window.scrollY + sectionRect.top;

  const maximumDocumentScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(Math.max(0, sectionDocTop), maximumDocumentScroll);
}

/**
 * Late-loading media keeps changing document height for a short window after
 * navigation, which drifts an already-applied scroll target — a masonry
 * gallery is the extreme case: each lazy `<img>` reserves no space until its
 * own network request resolves, so the grid can grow across several separate
 * reflows, not just one. Re-measure against every real layout-change event
 * (not a guessed delay) and keep correcting for the whole settling window,
 * rather than stopping after the first correction.
 *
 * The drift can come from the target's own frame growing, but just as
 * often from something earlier in the document growing instead (e.g. a
 * lazy-loaded gallery immediately above a later section) — that shifts the
 * frame's absolute document position without changing the frame's own
 * height at all. So the guard below compares the *computed target*, not
 * the frame height, to catch both cases.
 */
function watchForLayoutSettling(sectionId: string, section: HTMLElement) {
  if (typeof ResizeObserver === 'undefined') return;

  let lastTarget = computeSectionTarget(section);
  const stop = window.setTimeout(() => observer.disconnect(), 1800);

  const observer = new ResizeObserver(() => {
    if (sectionId !== window.decodeURIComponent(window.location.hash.slice(1))) {
      observer.disconnect();
      window.clearTimeout(stop);
      return;
    }
    // ResizeObserver always fires once right after observe() with the
    // current size, not just on a real change — skip that (and any other)
    // callback that doesn't actually move the target, so a settled frame
    // doesn't get a pointless re-correction attempt.
    const target = computeSectionTarget(section);
    if (Math.abs(target - lastTarget) < 1) return;
    lastTarget = target;

    if (Math.abs(target - window.scrollY) > 4) {
      // 'instant', not 'auto': `html` has global `scroll-behavior: smooth`,
      // which 'auto' would inherit, turning this snap-correction into a
      // second, visible scroll animation layered on top of the first.
      window.scrollTo({ top: target, behavior: 'instant' });
    }
  });

  observer.observe(document.body);
  observer.observe(section);
}

export function scrollToHomeSection(sectionId: string, behavior: ScrollBehavior = 'smooth') {
  if (sectionId === 'home') {
    window.scrollTo({ top: 0, behavior });
    return true;
  }

  const section = document.getElementById(sectionId);
  if (!section) return false;

  window.scrollTo({ top: computeSectionTarget(section), behavior });
  watchForLayoutSettling(sectionId, section);
  return true;
}
