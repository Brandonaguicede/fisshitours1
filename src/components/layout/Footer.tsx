import { Facebook, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CONTACT_EMAIL, DISPLAY_PHONE, FACEBOOK_URL, INSTAGRAM_URL } from '../../constants/contact';
import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { Container } from '../common/Container';
import { IconButton } from '../ui';

// Desktop (lg+, untouched): footer-shoreline.webp is the footer's own
// background at its native 2.5:1 ratio, `100% auto`, continuing exactly
// where About's reveal (AboutPreview.tsx) leaves off — set directly via
// the lg: arbitrary-value classes below (image + `bg-[#F1CFA9]` fallback),
// unchanged. Neither this nor the mobile block underneath is touched by
// the tablet scene in between.

// Tablet (768-1023px) only: same technique as desktop above, not a
// separate cropped band — footer-shoreline_tablet.png (plenty of real sand
// in frame) is the WRAPPER's own background (`md:[background-image:...]` +
// `bg-[#F6D8AC]` fallback below), `100% auto` (full width, proportional
// height, never stretched), so it keeps going for as long as the box
// itself is tall — i.e. behind the entire content column, not just an
// intro strip above it. The wrapper is pulled up (negative margin) so the
// image is already showing before the box's own top, behind the Contact
// CTA. The fallback color is only the same-toned catch for whatever the
// photo doesn't reach, same invisible role as desktop's.
// A flat solid-navy plateau (0-12%) before the fade starts, matching
// About's own solid navy exactly — swallows the seam where About's box
// ends and this wrapper's own (shifted-up) box begins, so that boundary
// always sits inside a flat matching color instead of right at the edge
// of a gradient (where even a hairline rendering mismatch reads as a
// visible cut). The rest is the same smooth, progressive curve.
const TABLET_NAVY_FADE =
  'linear-gradient(to bottom, rgba(11,40,66,1) 0%, rgba(11,40,66,1) 12%, rgba(11,40,66,0.92) 32%, rgba(11,40,66,0.72) 50%, rgba(11,40,66,0.42) 68%, rgba(11,40,66,0.16) 85%, rgba(11,40,66,0) 100%)';
// Where tablet content starts, on the photo's own real sand — also doubles
// as the navy fade's rough span (see the fade layer below, ~90% of this —
// long enough for the smoother curve above to fully resolve over the
// water, well before the sand).
const TABLET_CONTENT_TOP = 'clamp(200px, 30vw, 310px)';

// Mobile-only: a dedicated portrait shoreline photo (water near the top,
// foam mid-frame, sand for the rest) instead of reusing the wide desktop
// photo. It's entirely self-contained inside this footer's own box —
// unlike an earlier attempt, it never reaches up into About via a negative
// offset, so it can't trigger the Chromium bug where a large cross-parent
// sibling with a negative offset breaks the contact card's backdrop-filter.
// Kept fully opaque — no mask/fade on the photo itself — so its real
// colors (navy water, turquoise, white foam, sand) show through undimmed.
const MOBILE_SHORELINE_URL = "url('/footer/footer-shoreline_responsive.webp')";
// Sampled directly from this photo's own rendered bottom edge (at its
// actual cover-crop box size), so the flat color picks up exactly where
// the (opaque) photo leaves off. Only used as the fallback behind/below
// it, never seen through it.
const MOBILE_SAND_MATCH = '#F9D4B0';
// Navy melting into the water below it — starts at the site's real navy
// and fades out progressively while still over the water, gone before the
// foam and never tinting the sand.
const MOBILE_NAVY_FADE =
  'linear-gradient(to bottom, rgba(11,40,66,1) 0%, rgba(11,40,66,0.96) 15%, rgba(11,40,66,0.88) 30%, rgba(11,40,66,0.7) 45%, rgba(11,40,66,0.48) 60%, rgba(11,40,66,0.25) 75%, rgba(11,40,66,0.08) 90%, rgba(11,40,66,0) 100%)';
// How far the image/fade extend up past the footer's own top, into
// About's territory, so the water already reads as present behind/around
// the contact card instead of starting only once the footer itself
// begins.
const MOBILE_SHORELINE_REACH = 90;

export function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="relative text-ocean-900" id="footer">
      {/* Mobile (<768px): its own scene, self-contained — see notes above.
          Desktop/tablet below are entirely untouched. */}
      <div className="relative overflow-visible md:hidden" style={{ backgroundColor: MOBILE_SAND_MATCH }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 bg-no-repeat"
          style={{
            backgroundImage: MOBILE_SHORELINE_URL,
            top: `-${MOBILE_SHORELINE_REACH}px`,
            /* A plain bg-cover shows the photo's full height (open water
               down to sand) stretched across however tall the footer's
               content makes this box — which left a long stretch of empty
               open water before any content appeared. Sizing off the
               box's OWN height (not width) keeps the cropped-away top
               fraction constant across phone widths — width-relative
               sizing here would crop far more on wide phones than narrow
               ones, since content height barely changes with viewport
               width. Zooming past cover's minimum height and pinning to
               the bottom crops that dead water off the top instead, so
               the wave curl shows up sooner. */
            backgroundSize: 'auto 130%',
            backgroundPosition: 'center bottom',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] h-[150px]"
          style={{ top: `-${MOBILE_SHORELINE_REACH}px`, backgroundImage: MOBILE_NAVY_FADE }}
        />

        <div
          className="relative z-10 px-6 pb-8"
          style={{
            /* Just enough to clear the cropped-in wave/foam band above
               (see the photo's backgroundSize/Position) before content
               starts, without the large empty stretch of open water a
               taller offset used to leave. */
            paddingTop: `clamp(90px, calc(25vw + 10px), 150px)`,
          }}
        >
          {/* Marca */}
          <Link className="inline-flex flex-col items-start gap-2" to="/">
            <img alt="" aria-hidden="true" className="h-auto w-20 brightness-0" src="/images/papagayo-logo.png" />
            <span className="text-[20px] font-semibold leading-tight text-ocean-950">
              Papagayo <span className="text-ocean-700">Fishing Tours</span>
            </span>
          </Link>
          <p className="mt-2 max-w-xs text-sm leading-[1.5] text-ocean-800/85">
            {language === 'es'
              ? 'Charters de pesca, navegación privada, snorkeling, playa y bioluminiscencia en Costa Rica.'
              : 'Fishing charters, private navigation, snorkeling, beach and bioluminescence in Costa Rica.'}
          </p>

          {/* Redes sociales */}
          <div className="mt-3 flex gap-3">
            <IconButton
              className="border border-ocean-950/15 bg-transparent text-ocean-800 hover:bg-ocean-950/5 hover:text-ocean-950"
              href={INSTAGRAM_URL}
              icon={Instagram}
              label="Instagram"
              size="sm"
              target="_blank"
              variant="ghost"
            />
            <IconButton
              className="border border-ocean-950/15 bg-transparent text-ocean-800 hover:bg-ocean-950/5 hover:text-ocean-950"
              href={FACEBOOK_URL}
              icon={Facebook}
              label="Facebook"
              size="sm"
              target="_blank"
              variant="ghost"
            />
          </div>

          {/* Contacto */}
          <div className="mt-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700">{tr(text.nav.contact, language)}</h3>
            <div className="mt-2.5 grid gap-1.5 text-[13px] leading-[1.2] text-ocean-800">
              <span className="flex items-center gap-2"><MapPin size={16} /> San José, Costa Rica</span>
              <span className="flex items-center gap-2"><Phone size={16} /> {DISPLAY_PHONE}</span>
              <a className="flex items-center gap-2" href={`mailto:${CONTACT_EMAIL}`}><Mail className="shrink-0" size={16} /><span className="break-all">{CONTACT_EMAIL}</span></a>
            </div>
          </div>

          {/* Métodos de pago */}
          <div className="mt-6">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-700">
              {language === 'es' ? 'Métodos de pago' : 'Payment methods'}
            </p>
            <img
              alt={language === 'es' ? 'Métodos de pago aceptados' : 'Accepted payment methods'}
              className="h-auto w-full max-w-[160px] object-contain"
              src="/footer/payment_methods.png"
            />
          </div>

          {/* Copyright */}
          <div className="mt-6 border-t border-ocean-950/10 pt-3 pb-10 text-center text-xs text-ocean-700">
            © 2026 Papagayo Fishing Tours. {language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}
          </div>
        </div>
      </div>

      {/* Tablet (768-1023px): the photo IS the wrapper's own background —
          same technique as desktop below, just its own asset/position — so
          it keeps going behind the whole content column instead of ending
          in a separate band above it. Desktop (≥1024px) keeps its own
          background via the lg: classes here, entirely unchanged. */}
      <div
        className="relative hidden md:-mt-24 md:block md:bg-top md:bg-no-repeat md:bg-[#F6D8AC] md:[background-image:url('/footer/footer-shoreline_tablet.png')] md:[background-size:100%_auto] lg:mt-0 lg:bg-[#F1CFA9] lg:bg-no-repeat lg:bg-top lg:[background-image:url('/footer/footer-shoreline.webp')] lg:[background-size:100%_auto] lg:[background-position:center_calc(-1*clamp(220px,18vw,380px))]"
      >
        {/* Tablet-only navy fade: the wrapper above was already pulled up
            (negative margin) so this starts right behind the Contact CTA,
            over the photo's own water — see TABLET_NAVY_FADE. lg:hidden;
            desktop keeps About's own separate reveal for this (unchanged). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-0 lg:hidden"
          style={{ height: `calc(${TABLET_CONTENT_TOP} * 0.9)`, backgroundImage: TABLET_NAVY_FADE }}
        />

        <div className="relative z-10 pt-[clamp(200px,30vw,310px)] lg:z-auto lg:pt-[clamp(40px,5.2vw,150px)]">
          <Container className="grid gap-x-10 gap-y-3 pb-2 sm:pb-6 md:grid-cols-[1.1fr_0.8fr_1.1fr] md:gap-y-5 md:gap-x-8 lg:grid-cols-[1.3fr_0.8fr_1fr_1fr] lg:gap-x-8 lg:gap-y-4 lg:pb-1">
            {/* A — Marca */}
            <div>
              <Link className="inline-flex flex-col items-start gap-1.5 md:gap-1.5 lg:gap-2" to="/">
                <img alt="" aria-hidden="true" className="h-auto w-[90px] brightness-0 lg:w-[115px]" src="/images/papagayo-logo.png" />
                <span className="text-lg font-extrabold leading-tight text-ocean-950">
                  Papagayo <span className="text-ocean-700">Fishing Tours</span>
                </span>
              </Link>
              <p className="mt-1.5 max-w-xs text-[13px] leading-[1.45] text-ocean-800/85 md:mt-1.5 lg:mt-2">
                {language === 'es'
                  ? 'Charters de pesca, navegación privada, snorkeling, playa y bioluminiscencia en Costa Rica.'
                  : 'Fishing charters, private navigation, snorkeling, beach and bioluminescence in Costa Rica.'}
              </p>
              <div className="mt-2 flex gap-3 md:mt-2 lg:mt-2.5">
                <IconButton
                  className="border border-ocean-950/15 bg-transparent text-ocean-800 hover:bg-ocean-950/5 hover:text-ocean-950"
                  href={INSTAGRAM_URL}
                  icon={Instagram}
                  label="Instagram"
                  size="sm"
                  target="_blank"
                  variant="ghost"
                />
                <IconButton
                  className="border border-ocean-950/15 bg-transparent text-ocean-800 hover:bg-ocean-950/5 hover:text-ocean-950"
                  href={FACEBOOK_URL}
                  icon={Facebook}
                  label="Facebook"
                  size="sm"
                  target="_blank"
                  variant="ghost"
                />
              </div>
            </div>

            {/* B — Navegación */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700">
                {language === 'es' ? 'Navegación' : 'Navigation'}
              </h3>
              <div className="mt-2.5 grid grid-cols-1 gap-y-2 lg:gap-y-1">
                {navigationItems.map((item) => (
                  <Link className="w-fit text-[13px] leading-[1.2] text-ocean-800 underline-offset-4 transition hover:text-ocean-950 hover:underline lg:text-sm" key={item.href} to={item.href}>
                    {tr(item.label, language)}
                  </Link>
                ))}
              </div>
            </div>

            {/* C — Contacto + Métodos de pago */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700">{tr(text.nav.contact, language)}</h3>
              <div className="mt-2.5 grid gap-1.5 text-[13px] leading-[1.2] text-ocean-800 lg:text-sm">
                <span className="flex items-center gap-2"><MapPin size={16} /> San José, Costa Rica</span>
                <span className="flex items-center gap-2"><Phone size={16} /> {DISPLAY_PHONE}</span>
                <a className="flex items-center gap-2" href={`mailto:${CONTACT_EMAIL}`}><Mail className="shrink-0" size={16} /><span className="break-all">{CONTACT_EMAIL}</span></a>
              </div>

              <div className="mt-2 lg:mt-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-700">
                  {language === 'es' ? 'Métodos de pago' : 'Payment methods'}
                </p>
                <img
                  alt={language === 'es' ? 'Métodos de pago aceptados' : 'Accepted payment methods'}
                  className="h-auto w-full max-w-[190px] object-contain"
                  src="/footer/payment_methods.png"
                />
              </div>
            </div>

            {/* D — Frase editorial: pinned into column 3 (same column as
                Contacto+Pagos) at tablet via col-start, so it stacks inside
                that same column instead of floating alone across the sand;
                lg resets to its normal 4th-column placement, unchanged. */}
            <div className="hidden md:col-start-3 md:block md:text-right lg:col-auto lg:flex lg:items-start lg:justify-end lg:text-right">
              <p className="font-display max-w-[15rem] -rotate-1 text-[22px] italic leading-[1.15] text-ocean-900 md:ml-auto lg:ml-0 lg:text-[26px]">
                {language === 'es' ? (
                  <>
                    Más que un tour,
                    <br />
                    una mejor forma de vivir el día.
                  </>
                ) : (
                  <>
                    More than a tour,
                    <br />a better kind of day.
                  </>
                )}
              </p>
            </div>
          </Container>

          <div className="border-t border-ocean-950/10">
            <Container className="py-1.5 pb-1.5 text-center text-xs text-ocean-700">
              © 2026 Papagayo Fishing Tours. {language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}
            </Container>
          </div>
        </div>
      </div>
    </footer>
  );
}
