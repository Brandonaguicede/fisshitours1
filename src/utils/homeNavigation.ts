export function scrollToHomeSection(sectionId: string, behavior: ScrollBehavior = 'smooth') {
  if (sectionId === 'home') {
    window.scrollTo({ top: 0, behavior });
    return true;
  }

  const section = document.getElementById(sectionId);
  if (!section) return false;

  const anchor = section.querySelector<HTMLElement>('[data-section-anchor]') ?? section;
  const navbar = document.querySelector<HTMLElement>('[data-navbar-bar]');
  const navbarBottom = navbar?.getBoundingClientRect().bottom ?? 0;
  const configuredGap = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-section-gap'),
  );
  const visualGap = Number.isFinite(configuredGap) ? configuredGap : 48;
  const anchorTop = window.scrollY + anchor.getBoundingClientRect().top;
  const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const targetTop = Math.min(Math.max(0, anchorTop - navbarBottom - visualGap), maximumScroll);

  window.scrollTo({ top: targetTop, behavior });
  return true;
}
