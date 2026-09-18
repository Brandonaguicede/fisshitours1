import { Anchor, Mail, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Container } from '../common/Container';
import { Button, Chip, GlassPanel, SectionHeader } from '../ui';
import { useLanguage } from '../../i18n/LanguageContext';
import { buildAboutCarouselImages, DEFAULT_ABOUT_SETTINGS, getAboutSettings, splitParagraphs, type AboutSettings } from '../../services/aboutSettings';

// The shoreline photo starts appearing behind the contact card, tablet/
// desktop only (mobile owns its own separate shoreline scene inside
// Footer.tsx now — see notes there). Anchored with `bottom: 0` against the
// section itself (not `top`), so its bottom edge is pinned exactly to the
// section's own end — i.e. exactly where the Footer's own photo picks up,
// at any viewport height. pointer-events-none, position:absolute — never
// affects About's own box height, data-home-section, or nav/scroll
// geometry.
const SHORELINE_URL = "url('/footer/footer-shoreline.webp')";
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

export function AboutPreview() {
  const { language } = useLanguage();
  const locale = language === 'es' ? 'es' : 'en';
  const aboutQuery = useQuery({ queryKey: ['site-settings', 'about'], queryFn: getAboutSettings, staleTime: 60_000 });
  const about = aboutQuery.data ?? DEFAULT_ABOUT_SETTINGS;

  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const images = useMemo(() => buildAboutCarouselImages(about).filter((url) => !failedImages.has(url)), [about, failedImages]);
  const [activeImage, setActiveImage] = useState(0);
  const visibleIndex = images.length ? activeImage % images.length : 0;

  useEffect(() => {
    if (images.length < 2) return;
    const interval = window.setInterval(() => {
      setActiveImage((index) => (index + 1) % images.length);
    }, 3400);

    return () => window.clearInterval(interval);
  }, [images.length]);

  const paragraphs = splitParagraphs(about[`about.preview_text.${locale}` as keyof AboutSettings]);
  const storyParagraphs = splitParagraphs(about[`about.story.${locale}` as keyof AboutSettings]);
  const [showStory, setShowStory] = useState(false);

  return (
    <section className="home-section section-y relative overflow-hidden bg-ocean-950 text-white" data-home-section data-nav-href="/#about" id="about">
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
            <p className="mt-2 max-w-md text-[0.92rem] font-semibold text-ocean-200 sm:max-w-lg sm:text-base">
              {about[`about.description.${locale}` as keyof AboutSettings]}
            </p>
            <div className="mt-3 grid max-w-md gap-2.5 text-left text-[0.92rem] leading-7 text-ocean-100/90 sm:max-w-lg sm:text-[0.95rem] lg:max-w-xl lg:gap-2 lg:text-base lg:text-justify">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
            {storyParagraphs.length ? (
              <div className="mt-3 max-w-md sm:max-w-lg lg:max-w-xl">
                <button
                  type="button"
                  className="text-[0.85rem] font-extrabold text-ocean-200 underline decoration-ocean-300/60 underline-offset-4 hover:text-white"
                  onClick={() => setShowStory((current) => !current)}
                >
                  {showStory ? (language === 'es' ? 'Ocultar historia' : 'Hide our story') : (language === 'es' ? 'Leer nuestra historia' : 'Read our story')}
                </button>
                {showStory ? (
                  <div className="mt-2 grid gap-2.5 text-left text-[0.92rem] leading-7 text-ocean-100/90 sm:text-[0.95rem] lg:text-base lg:text-justify">
                    {storyParagraphs.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <div className="about-glass-showcase relative aspect-[1.5/1] overflow-hidden rounded-[1.5rem] sm:aspect-[1.75/1] lg:aspect-auto lg:h-[clamp(300px,40vh,340px)] min-[1536px]:h-[clamp(320px,38vh,360px)] min-[1920px]:h-[clamp(340px,32vh,420px)]">
              {images.map((image, index) => (
                <img
                  key={image}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === visibleIndex ? 'opacity-100' : 'opacity-0'}`}
                  src={image}
                  alt={index === visibleIndex ? about[`about.image_alt.${locale}` as keyof AboutSettings] : ''}
                  aria-hidden={index === visibleIndex ? undefined : true}
                  loading="eager"
                  onError={() => setFailedImages((current) => new Set(current).add(image))}
                />
              ))}
              <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
                {images.map((image, index) => (
                  <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === visibleIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
                ))}
              </div>
              {images.length === 0 ? <p className="absolute inset-0 grid place-items-center text-sm text-ocean-100">{language === 'es' ? 'Imagen no disponible' : 'Image unavailable'}</p> : null}
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
                {about[`about.cta_title.${locale}` as keyof AboutSettings]}
              </h3>
              <p className="mt-0.5 truncate text-[0.78rem] text-ocean-100/80">
                {about[`about.cta_text.${locale}` as keyof AboutSettings]}
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
