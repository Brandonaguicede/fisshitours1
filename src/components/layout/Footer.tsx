import { Facebook, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CONTACT_EMAIL, DISPLAY_PHONE, FACEBOOK_URL, INSTAGRAM_URL } from '../../constants/contact';
import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { Container } from '../common/Container';
import { IconButton } from '../ui';

// Desktop (lg+, untouched): footer-shoreline.png is the footer's own
// background at its native 2.5:1 ratio, `100% auto`, continuing exactly
// where About's reveal (AboutPreview.tsx) leaves off. Tablet keeps its own
// separate band below. Neither is touched by the mobile block underneath.
const SAND_MATCH = '#F1CFA9';
const SHORELINE_URL = "url('/footer/footer-shoreline.png')";
const TABLET_BAND_FADE = {
  maskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)',
};

// Mobile-only: a dedicated portrait shoreline photo (water near the top,
// foam mid-frame, sand for the rest) instead of reusing the wide desktop
// photo. It's entirely self-contained inside this footer's own box —
// unlike an earlier attempt, it never reaches up into About via a negative
// offset, so it can't trigger the Chromium bug where a large cross-parent
// sibling with a negative offset breaks the contact card's backdrop-filter.
// Kept fully opaque — no mask/fade on the photo itself — so its real
// colors (navy water, turquoise, white foam, sand) show through undimmed.
const MOBILE_SHORELINE_URL = "url('/footer/footer-shoreline_responsive.png')";
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
// The main shoreline layer's own crop only carries water/foam/the start of
// the sand — extending its own box tall enough to reach all the way down
// to the copyright block would flatten the foam into a sliver. Instead a
// second layer picks up exactly where it ends, showing a deep, pre-foam
// slice of the SAME photo (rows 1000–1460 of the 1536px-tall source, well
// past any foam) at native resolution, so the footer content sits on real
// photographed sand all the way down — never a flat CSS color.
const MOBILE_SAND_EXTENSION_STYLE = {
  backgroundImage: MOBILE_SHORELINE_URL,
  backgroundSize: '1024px auto',
  backgroundPosition: 'center -1000px',
  backgroundRepeat: 'no-repeat',
} as const;

export function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="relative text-ocean-900" id="footer">
      {/* Mobile (<768px): its own scene, self-contained — see notes above.
          Desktop/tablet below are entirely untouched. */}
      <div className="relative overflow-visible md:hidden" style={{ backgroundColor: MOBILE_SAND_MATCH }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0 bg-cover bg-top bg-no-repeat"
          style={{
            backgroundImage: MOBILE_SHORELINE_URL,
            top: `-${MOBILE_SHORELINE_REACH}px`,
            height: `clamp(300px, calc(55vw + ${MOBILE_SHORELINE_REACH}px), 350px)`,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] h-[150px]"
          style={{ top: `-${MOBILE_SHORELINE_REACH}px`, backgroundImage: MOBILE_NAVY_FADE }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0 top-[214.5px] h-[460px]"
          style={MOBILE_SAND_EXTENSION_STYLE}
        />

        <div className="relative z-10 px-6 pb-8 pt-[160px]">
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

          {/* Navegación */}
          <div className="mt-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ocean-700">
              {language === 'es' ? 'Navegación' : 'Navigation'}
            </h3>
            <div className="mt-2.5 grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-10 gap-y-2">
              {navigationItems.map((item) => (
                <Link className="w-fit text-[13px] leading-[1.2] text-ocean-800 underline-offset-4 transition hover:text-ocean-950 hover:underline" key={item.href} to={item.href}>
                  {tr(item.label, language)}
                </Link>
              ))}
            </div>
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

      {/* Tablet/desktop (≥768px): entirely unchanged. */}
      <div
        className="relative hidden md:block lg:bg-no-repeat lg:bg-top lg:[background-image:url('/footer/footer-shoreline.png')] lg:[background-size:100%_auto] lg:[background-position:center_calc(-1*clamp(220px,18vw,380px))]"
        style={{ backgroundColor: SAND_MATCH }}
      >
        {/* Tablet-only band. Padding-top below matches this band's own
            height exactly, so content starts right where it ends (it's
            `position:absolute`, so it would otherwise paint over content
            that started earlier). lg keeps its own background, declared
            above. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[clamp(220px,26vw,280px)] bg-cover bg-top bg-no-repeat lg:hidden"
          style={{ backgroundImage: SHORELINE_URL, ...TABLET_BAND_FADE }}
        />

        <div className="relative pt-[clamp(220px,26vw,280px)] lg:pt-[clamp(40px,5.2vw,150px)]">
          <Container className="grid gap-x-10 gap-y-3 pb-2 sm:pb-6 md:grid-cols-2 md:gap-y-6 md:gap-x-12 lg:grid-cols-[1.3fr_0.8fr_1fr_1fr] lg:gap-x-8 lg:gap-y-4 lg:pb-1">
            {/* A — Marca */}
            <div>
              <Link className="inline-flex flex-col items-start gap-2" to="/">
                <img alt="" aria-hidden="true" className="h-auto w-[90px] brightness-0 lg:w-[115px]" src="/images/papagayo-logo.png" />
                <span className="text-lg font-extrabold leading-tight text-ocean-950">
                  Papagayo <span className="text-ocean-700">Fishing Tours</span>
                </span>
              </Link>
              <p className="mt-2 max-w-xs text-[13px] leading-[1.45] text-ocean-800/85">
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

              <div className="mt-2.5">
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

            {/* D — Frase editorial */}
            <div className="hidden md:block lg:flex lg:items-start lg:justify-end lg:text-right">
              <p className="font-display max-w-[15rem] -rotate-1 text-[22px] italic leading-[1.15] text-ocean-900 lg:text-[26px]">
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
