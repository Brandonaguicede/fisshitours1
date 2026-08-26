const DEFAULT_SAFE_HEADER = 96;
const DEFAULT_SECTION_GAP = 44;
const MIN_GAP_RATIO = 0.6;
const CONTENT_VISIBILITY_TARGET = 0.45;
const PRIMARY_BLOCK_MIN_HEIGHT = 100;

function readToken(name: string, fallback: number) {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function getSafeHeaderHeight() {
  return readToken('--header-safe-height', DEFAULT_SAFE_HEADER);
}

function getSectionGap() {
  return readToken('--nav-section-gap', DEFAULT_SECTION_GAP);
}

export function getHomeAnchorOffset() {
  return getSafeHeaderHeight() + getSectionGap();
}

function getPrimaryContentBlock(section: HTMLElement, anchor: HTMLElement) {
  let firstSibling: HTMLElement | null = null;
  let node: Element | null = anchor.nextElementSibling;
  while (node) {
    if (node instanceof HTMLElement) {
      if (!firstSibling) firstSibling = node;
      if (node.offsetHeight >= PRIMARY_BLOCK_MIN_HEIGHT) return node;
    }
    node = node.nextElementSibling;
  }
  return firstSibling;
}

export function scrollToHomeSection(sectionId: string, behavior: ScrollBehavior = 'smooth') {
  if (sectionId === 'home') {
    window.scrollTo({ top: 0, behavior });
    return true;
  }

  const section = document.getElementById(sectionId);
  if (!section) return false;

  const anchor = section.querySelector<HTMLElement>('[data-section-anchor]') ?? section;
  const safeHeaderHeight = getSafeHeaderHeight();
  const desiredGap = getSectionGap();
  const minGap = Math.round(desiredGap * MIN_GAP_RATIO);

  const viewportHeight = window.innerHeight;
  const anchorTop = window.scrollY + anchor.getBoundingClientRect().top;
  const introHeight = anchor.offsetHeight;
  const primaryContent = getPrimaryContentBlock(section, anchor);
  const primaryContentHeight = primaryContent?.offsetHeight ?? 0;

  let gap = desiredGap;
  const availableHeight = viewportHeight - safeHeaderHeight;
  if (primaryContentHeight > 0 && availableHeight > 0) {
    const requiredHeight = introHeight + primaryContentHeight * CONTENT_VISIBILITY_TARGET;
    if (gap + requiredHeight > availableHeight) {
      gap = Math.max(minGap, Math.floor(availableHeight - requiredHeight));
    }
  }

  const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const targetTop = Math.min(Math.max(0, anchorTop - safeHeaderHeight - gap), maximumScroll);

  window.scrollTo({ top: targetTop, behavior });
  return true;
}
