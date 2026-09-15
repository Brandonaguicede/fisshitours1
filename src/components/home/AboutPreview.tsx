import { Anchor, Mail, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Container } from '../common/Container';
import { Button, Chip, GlassPanel, SectionHeader } from '../ui';
import { useLanguage } from '../../i18n/LanguageContext';
import { DEFAULT_ABOUT_SETTINGS, getAboutSettings, splitParagraphs, type AboutSettings } from '../../services/aboutSettings';

// The shoreline photo starts appearing behind the contact card, tablet/
// desktop only (mobile owns its own separate shoreline scene inside
// Footer.tsx now — see notes there). Anchored with `bottom: 0` against the
// section itself (not `top`), so its bottom edge is pinned exactly to the
// section's own end — i.e. exactly where the Footer's own photo picks up,
// at any viewport height. pointer-events-none, position:absolute — never
// affects About's own box height, data-home-section, or nav/scroll
// geometry.
const SHORELINE_URL = "url('/footer/footer-shoreline.png')";
// The Footer's own photo there picks up exactly where this gradient
// finishes resolving (see Footer.tsx), so it MUST reach fully transparent
// by 100% — anything left over would show as a tint mismatch at the seam.
const CONTACT_SHORELINE_REVEAL =
  'linear-gradient(to bottom, rgba(11,40,66,1) 0%, rgba(11,40,66,0.98) 10%, rgba(11,40,66,0.94) 22%, rgba(11,40,66,0.85) 35%, rgba(11,40,66,0.68) 48%, rgba(11,40,66,0.48) 60%, rgba(11,40,66,0.28) 72%, rgba(11,40,66,0.14) 84%, rgba(11,40,66,0.05) 92%, rgba(11,40,66,0) 100%)';
// Tablet/desktop only: the box itself also fades in (not just its color
// content) — its own top edge is a hard geometric line otherwise, since
// About's ambient glow (below) tints the navy slightly differently than
// this layer's flat rgba(navy) does. Masking the layer's own visibility in
// over its first ~20% means there is never a single row where "layer"
// meets "no layer".
const REVEAL_MASK = 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)';

const FALLBACK_IMAGES = [
  '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
  '/about/IMG_1020 (1).jpeg',
  '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
  '/galeria/IMG_9407.jpeg',
];

function buildCarouselImages(settings: AboutSettings): string[] {
  const managed = settings['about.image'];
  return Array.from(new Set([...FALLBACK_IMAGES, managed].filter(Boolean)));
}

export function AboutPreview() {
  const { language } = useLanguage();
  const locale = language === 'es' ? 'es' : 'en';
  const aboutQuery = useQuery({ queryKey: ['site-settings', 'about'], queryFn: getAboutSettings, staleTime: 60_000 });
  const about = aboutQuery.data ?? DEFAULT_ABOUT_SETTINGS;

  const images = useMemo(() => buildCarouselImages(about), [about]);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveImage((index) => (index + 1) % images.length);
    }, 3400);

    return () => window.clearInterval(interval);
  }, [images.length]);

  const paragraphs = splitParagraphs(about[`about.preview_text.${locale}` as keyof AboutSettings]);

  return (
    <section className="home-section relative overflow-hidden bg-ocean-950 pb-12 pt-6 text-white sm:pb-14 sm:pt-8 lg:pb-16 lg:pt-10" data-home-section data-nav-href="/#about" id="about">
      <div className="about-ocean-atmosphere pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(110,172,201,0.16),transparent_34%),linear-gradient(180deg,rgba(11,40,66,0)_0%,rgba(19,62,98,0.32)_48%,rgba(11,40,66,0)_100%)]" aria-hidden="true" />
      {/* Shoreline reveal — see notes above. Bottom-anchored to the section
          itself, so it always finishes resolving exactly at the Footer's
          own top, regardless of viewport height. Tablet/desktop only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 hidden h-[130px] bg-top bg-no-repeat md:block lg:h-[clamp(220px,18vw,380px)]"
        style={{
          backgroundImage: `${CONTACT_SHORELINE_REVEAL}, ${SHORELINE_URL}`,
          backgroundSize: '100% auto',
          maskImage: REVEAL_MASK,
          WebkitMaskImage: REVEAL_MASK,
        }}
      />
      <Container>
        <div data-nav-frame>
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)] lg:items-start">
          <div className="max-w-2xl lg:[&_h2]:text-[clamp(2.125rem,1.33rem+1.08vw,2.75rem)] lg:[&_h2]:leading-[1.12]">
            <SectionHeader align="left" title={about[`about.title.${locale}` as keyof AboutSettings]} variant="default" />
            <div className="mt-3 grid max-w-md gap-2.5 text-left text-[0.92rem] leading-7 text-ocean-100/90 sm:max-w-lg sm:text-[0.95rem] lg:max-w-xl lg:gap-2 lg:text-base lg:text-justify">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="about-glass-showcase relative aspect-[1.5/1] overflow-hidden rounded-[1.5rem] sm:aspect-[1.75/1] lg:aspect-auto lg:h-[clamp(300px,40vh,340px)] min-[1536px]:h-[clamp(320px,38vh,360px)] min-[1920px]:h-[clamp(340px,32vh,420px)]">
              {images.map((image, index) => (
                <img
                  key={image}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeImage ? 'opacity-100' : 'opacity-0'}`}
                  src={image}
                  alt={index === 0 ? about[`about.image_alt.${locale}` as keyof AboutSettings] : ''}
                  aria-hidden={index === 0 ? undefined : true}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              ))}
              <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
                {images.map((image, index) => (
                  <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ocean-950/46 to-transparent" aria-hidden="true" />
            </div>
            <Chip className="absolute right-5 top-5 gap-1.5 border border-white/45 bg-ocean-100/90 px-4 py-2 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-ocean-950 shadow-soft backdrop-blur-md">
              <Anchor size={13} /> {language === 'es' ? '100% local' : '100% local'}
            </Chip>
          </div>
        </div>
        </div>

        <GlassPanel className="relative z-30 mt-6 flex flex-col items-start gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-3.5" variant="subtle">
          <div className="flex min-w-0 items-center gap-3">
            <GlassPanel as="span" className="grid size-9 shrink-0 place-items-center text-ocean-200" shape="circle" variant="control">
              <MessageCircle aria-hidden="true" size={15} />
            </GlassPanel>
            <div className="min-w-0">
              <h3 className="text-[0.88rem] font-extrabold leading-tight text-white">
                {language === 'es' ? '¿Quieres hablar con nosotros?' : 'Want to talk with us?'}
              </h3>
              <p className="mt-0.5 truncate text-[0.78rem] text-ocean-100/80">
                {language === 'es' ? 'Escríbenos y con gusto te ayudamos.' : "Send us a message and we'll be happy to help."}
              </p>
            </div>
          </div>
          <Button className="w-full shrink-0 gap-1.5 sm:w-auto" size="xs" variant="glass" to="/contacto">
            <Mail aria-hidden="true" size={14} />
            {language === 'es' ? 'Ver información de contacto' : 'View contact information'}
          </Button>
        </GlassPanel>
      </Container>
    </section>
  );
}
