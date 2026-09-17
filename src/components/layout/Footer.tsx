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
// where About's reveal (AboutPreview.tsx) leaves off. Tablet keeps its own
// separate band below. Neither is touched by the mobile block underneath.
const SAND_MATCH = '#F1CFA9';
const SHORELINE_URL = "url('/footer/footer-shoreline.webp')";
// Tablet (768-1023px): self-contained, like mobile below — About no longer
// draws any shoreline in this range (see AboutPreview.tsx), so this single
// layer owns the whole scene on its own: it reaches up behind the Contact
// CTA, carries its own navy fade, and shows the photo at its real, un-
// cropped 2.5:1 aspect ratio (via `aspectRatio`, not a zoomed `bg-cover`
// slice) so what ends up under the content is the photo's own real sand,
// not a flat color standing in for it. `SAND_MATCH` below stays only as
// the (matching-toned) fallback for whatever sliver the photo doesn't
// reach — same role it already plays, invisibly, under desktop.
const TABLET_SCENE_REACH = 72;
const TABLET_SCENE_HEIGHT = 'clamp(230px, 40vw, 380px)';
const TABLET_NAVY_FADE =
  'linear-gradient(to bottom, rgba(11,40,66,1) 0%, rgba(11,40,66,0.9) 20%, rgba(11,40,66,0.65) 40%, rgba(11,40,66,0.3) 60%, rgba(11,40,66,0.08) 80%, rgba(11,40,66,0) 100%)';

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
// How far the scene band reaches up past the footer's own top, into
// About's territory, so the water already reads as present behind/around
// the contact card instead of starting only once the footer itself
// begins. Fixed (not content-derived) on purpose — see MOBILE_SCENE_HEIGHT.
const MOBILE_SCENE_REACH = 64;
// The scene band's OWN height, from the footer's top edge down to where
// real content starts — sized purely off viewport width (vw), never off
// the footer's rendered content height. The previous version sized the
// photo at `auto 130%` of the surrounding box, whose height was however
// tall the footer's own text content happened to render — at widths where
// wrapping made that box tall, the photo (and the empty-water gap before
// content) ballooned right along with it. A fixed, vw-only band decouples
// the two completely, so the transition strip stays the same short height
// everywhere from 320px to 767px, regardless of copy length.
const MOBILE_SCENE_HEIGHT = 'clamp(130px, 30vw, 180px)';

export function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="relative text-ocean-900" id="footer">
      {/* Mobile (<768px): its own scene, self-contained — see notes above.
          Desktop/tablet below are entirely untouched. A single fixed-height
          band (MOBILE_SCENE_HEIGHT) covers the whole <768px range — no
          separate sub-breakpoint inside it, so there is nothing that can
          fall between two tuned widths the way 573px did before. */}
      <div className="relative overflow-visible md:hidden" style={{ backgroundColor: MOBILE_SAND_MATCH }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0 bg-cover bg-bottom bg-no-repeat"
          style={{
            backgroundImage: MOBILE_SHORELINE_URL,
            top: `-${MOBILE_SCENE_REACH}px`,
            height: `calc(${MOBILE_SCENE_HEIGHT} + ${MOBILE_SCENE_REACH}px)`,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] h-[150px]"
          style={{ top: `-${MOBILE_SCENE_REACH}px`, backgroundImage: MOBILE_NAVY_FADE }}
        />

        <div
          className="relative z-10 px-6 pb-8"
          style={{
            /* Content starts exactly where the fixed scene band ends —
               no dependency on the band's height in the other direction. */
            paddingTop: MOBILE_SCENE_HEIGHT,
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

      {/* Tablet (768-1023px) self-contained scene + desktop (≥1024px, its
          own background declared below, untouched). */}
      <div
        className="relative overflow-visible hidden md:block lg:bg-no-repeat lg:bg-top lg:[background-image:url('/footer/footer-shoreline.webp')] lg:[background-size:100%_auto] lg:[background-position:center_calc(-1*clamp(220px,18vw,380px))]"
        style={{ backgroundColor: SAND_MATCH }}
      >
        {/* Tablet-only scene: the real photo at its native aspect ratio
            (never zoomed/cropped to a thin slice), reaching up behind the
            Contact CTA with its own navy fade — see constants above. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0 bg-cover bg-bottom bg-no-repeat lg:hidden"
          style={{
            backgroundImage: SHORELINE_URL,
            top: `-${TABLET_SCENE_REACH}px`,
            height: `calc(${TABLET_SCENE_HEIGHT} + ${TABLET_SCENE_REACH}px)`,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] lg:hidden"
          style={{ top: `-${TABLET_SCENE_REACH}px`, height: `calc(${TABLET_SCENE_HEIGHT} * 0.7)`, backgroundImage: TABLET_NAVY_FADE }}
        />

        <div className="relative z-10 pt-[clamp(230px,40vw,380px)] lg:z-auto lg:pt-[clamp(40px,5.2vw,150px)]">
          <Container className="grid gap-x-10 gap-y-3 pb-2 sm:pb-6 md:grid-cols-2 md:gap-y-6 md:gap-x-12 lg:grid-cols-[1.3fr_0.8fr_1fr_1fr] lg:gap-x-8 lg:gap-y-4 lg:pb-1">
            {/* A — Marca */}
            <div>
              <Link className="inline-flex flex-col items-start gap-2" to="/">
                <img alt="" aria-hidden="true" className="h-auto w-[90px] brightness-0 lg:w-[115px]" src="/images/papagayo-logo.png" />
                <span className="text-lg font-extrabold leading-tight text-ocean-950 md:text-xl lg:text-lg">
                  Papagayo <span className="text-ocean-700">Fishing Tours</span>
                </span>
              </Link>
              <p className="mt-2 max-w-xs text-[13px] leading-[1.45] text-ocean-800/85 md:text-sm lg:text-[13px]">
                {language === 'es'
                  ? 'Charters de pesca, navegación privada, snorkeling, playa y bioluminiscencia en Costa Rica.'
                  : 'Fishing charters, private navigation, snorkeling, beach and bioluminescence in Costa Rica.'}
              </p>
              <div className="mt-2.5 flex gap-3">
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
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700 md:text-xs lg:text-[11px]">
                {language === 'es' ? 'Navegación' : 'Navigation'}
              </h3>
              {/* Tablet: 2 internal columns, filled column-first (items 1-4
                  in col 1, 5-8 in col 2) so the 8-item list doesn't stretch
                  the footer tall. Desktop (lg) restores the original single
                  vertical list, untouched. */}
              <div className="mt-2.5 grid grid-flow-col grid-rows-4 grid-cols-2 gap-x-4 gap-y-2 lg:grid-flow-row lg:grid-cols-1 lg:grid-rows-none lg:gap-x-0 lg:gap-y-1">
                {navigationItems.map((item) => (
                  <Link className="w-fit text-sm leading-[1.2] text-ocean-800 underline-offset-4 transition hover:text-ocean-950 hover:underline" key={item.href} to={item.href}>
                    {tr(item.label, language)}
                  </Link>
                ))}
              </div>
            </div>

            {/* C — Contacto + Métodos de pago */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700 md:text-xs lg:text-[11px]">{tr(text.nav.contact, language)}</h3>
              <div className="mt-2.5 grid gap-1.5 text-sm leading-[1.2] text-ocean-800">
                <span className="flex items-center gap-2"><MapPin size={16} /> San José, Costa Rica</span>
                <span className="flex items-center gap-2"><Phone size={16} /> {DISPLAY_PHONE}</span>
                <a className="flex items-center gap-2" href={`mailto:${CONTACT_EMAIL}`}><Mail className="shrink-0" size={16} /><span className="break-all">{CONTACT_EMAIL}</span></a>
              </div>

              <div className="mt-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-700 md:text-xs lg:text-[11px]">
                  {language === 'es' ? 'Métodos de pago' : 'Payment methods'}
                </p>
                <img
                  alt={language === 'es' ? 'Métodos de pago aceptados' : 'Accepted payment methods'}
                  className="h-auto w-full max-w-[160px] object-contain lg:max-w-[190px]"
                  src="/footer/payment_methods.png"
                />
              </div>
            </div>

            {/* D — Frase editorial */}
            <div className="hidden md:block md:text-right lg:flex lg:items-start lg:justify-end lg:text-right">
              <p className="font-display max-w-[15rem] -rotate-1 text-[24px] italic leading-[1.15] text-ocean-900 md:ml-auto lg:ml-0 lg:text-[26px]">
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
