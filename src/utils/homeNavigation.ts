const DEFAULT_SAFE_HEADER = 96;
const LANDING_GAP = 20;

function readToken(name: string, fallback: number) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export function getSafeHeaderHeight() {
  return readToken('--header-safe-height', DEFAULT_SAFE_HEADER);
}

function getNavbarBottom() {
  const navbar = document.querySelector<HTMLElement>('[data-navbar-bar]');
  return navbar ? navbar.getBoundingClientRect().bottom : getSafeHeaderHeight();
}

/**
 * Everything below the navbar, plus one shared breathing margin, is the
 * "usable" viewport a landed section is composed within. One constant for
 * every section — never a per-section offset.
 */
function getUsableTop() {
  return getNavbarBottom() + LANDING_GAP;
}

function getNavFrame(section: HTMLElement) {
  return section.querySelector<HTMLElement>('[data-nav-frame]') ?? section;
}

/**
 * A `[data-nav-frame]` can contain a `[data-nav-frame-end]` marker to say
 * "the composition I want judged for fit ends here" even though real content
 * (a boat list, a pricing breakdown) continues below it in the DOM — that
 * trailing content still renders and is still reachable by scrolling, it
 * just isn't required to be centered or forced to fit. Falls back to the
 * frame's own bottom when no marker is present.
 */
function getFrameBottom(frame: HTMLElement) {
  const marker = frame.querySelector<HTMLElement>('[data-nav-frame-end]');
  return marker ? marker.getBoundingClientRect().top : frame.getBoundingClientRect().bottom;
}

/**
 * The frame is the part of a section that should read as deliberately
 * composed for the viewport: eyebrow, title, description, and its primary
 * content (a card row, a stepper, a stats block — whatever `[data-nav-frame]`
 * wraps, up to any `[data-nav-frame-end]` marker inside it). When the frame
 * is shorter than the usable viewport, it is vertically centered inside it
 * so the landing feels balanced rather than merely "scrolled to". When the
 * frame is taller than the usable viewport (a long boat list, a tall image
 * grid), it physically cannot be centered without cropping its own top, so
 * it lands top-aligned with the same shared gap instead — never a bespoke
 * offset.
 */
function computeSectionTarget(section: HTMLElement) {
  const frame = getNavFrame(section);
  const usableTop = getUsableTop();
  const usableHeight = Math.max(0, window.innerHeight - usableTop);

  const frameRect = frame.getBoundingClientRect();
  const frameDocTop = window.scrollY + frameRect.top;
  const frameHeight = getFrameBottom(frame) - frameRect.top;

  const topAlignedScroll = frameDocTop - usableTop;
  const targetScrollY = frameHeight <= usableHeight
    ? topAlignedScroll - (usableHeight - frameHeight) / 2
    : topAlignedScroll;

  const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(Math.max(0, targetScrollY), maximumScroll);
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
