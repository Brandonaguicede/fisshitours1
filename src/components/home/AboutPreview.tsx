import { Anchor, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { useLanguage } from '../../i18n/LanguageContext';
import { DEFAULT_ABOUT_SETTINGS, getAboutSettings, splitParagraphs, type AboutSettings } from '../../services/aboutSettings';

const FALLBACK_IMAGES = [
  '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
  '/about/IMG_1020 (1).jpeg',
  '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
  '/galeria/IMG_9407.jpeg',
];

function buildCarouselImages(settings: AboutSettings): string[] {
  const managed = settings['about.image'];
  return Array.from(new Set([managed, ...FALLBACK_IMAGES].filter(Boolean)));
}

const valueCards = [
  {
    title: { es: 'Herencia y tradicion local', en: 'Local heritage and tradition' },
    description: {
      es: 'Negocio familiar con experiencia local.',
      en: 'Family business with local experience.',
    },
    icon: Anchor,
  },
  {
    title: { es: 'Seguridad de nivel superior', en: 'High-level safety' },
    description: {
      es: 'Tripulacion profesional y protocolos claros.',
      en: 'Professional crew and clear protocols.',
    },
    icon: ShieldCheck,
  },
  {
    title: { es: 'Experiencias 100% a la medida', en: 'Fully tailored experiences' },
    description: {
      es: 'Itinerarios ajustados a tu grupo.',
      en: 'Itineraries tailored to your group.',
    },
    icon: SlidersHorizontal,
  },
];

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
    <section className="section-y bg-ocean-900 text-white">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">
              {about[`about.eyebrow.${locale}` as keyof AboutSettings]}
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              {about[`about.title.${locale}` as keyof AboutSettings]}
            </h2>

            <div className="mt-6 grid max-w-3xl gap-4 text-base leading-8 text-ocean-200">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>

          </div>

          <div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-lifted backdrop-blur-xl">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.4rem]">
                {images.map((image, index) => (
                  <img
                    key={image}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeImage ? 'opacity-100' : 'opacity-0'}`}
                    src={image}
                    alt={index === 0 ? about[`about.image_alt.${locale}` as keyof AboutSettings] : ''}
                    aria-hidden={index === 0 ? undefined : true}
                    loading={index === 0 ? 'lazy' : 'eager'}
                  />
                ))}
                <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
                  {images.map((image, index) => (
                    <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" to="/nosotros">
                {about[`about.preview_button_label.${locale}` as keyof AboutSettings]}
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-3 md:grid-cols-3">
          {valueCards.map((card) => (
            <article key={card.title.en} className="group grid gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-300/60 hover:bg-white/[0.1] hover:shadow-lifted">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ocean-600 transition duration-300 group-hover:scale-105 group-hover:bg-ocean-100">
                <card.icon size={18} />
              </span>
              <span>
                <h3 className="text-sm font-extrabold text-white">{card.title[language]}</h3>
                <p className="mt-0.5 text-xs leading-5 text-ocean-200">{card.description[language]}</p>
              </span>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
