import { Anchor, Compass, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Container } from '../common/Container';
import { Button, Chip, GlassPanel, SectionHeader } from '../ui';
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
  return Array.from(new Set([...FALLBACK_IMAGES, managed].filter(Boolean)));
}

const valueCards = [
  {
    title: { es: 'Nacidos en Playas del Coco', en: 'Born in Playas del Coco' },
    description: {
      es: 'Somos locales, familia y mar: conectados con nuestra comunidad y el Pacifico.',
      en: 'We are local, family-run and deeply connected to our community and the sea.',
    },
    icon: Anchor,
  },
  {
    title: { es: 'La seguridad va primero', en: 'Safety comes first' },
    description: {
      es: 'Tripulacion profesional, barcos bien cuidados y protocolos claros.',
      en: 'Professional crew, well-maintained boats and clear protocols for peace of mind.',
    },
    icon: ShieldCheck,
  },
  {
    title: { es: 'Hecho para tu grupo', en: 'Made for your group' },
    description: {
      es: 'Tours privados e itinerarios flexibles segun tu estilo y objetivos.',
      en: 'Private tours and flexible itineraries tailored to your style and goals.',
    },
    icon: Users,
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
    <section className="home-section relative overflow-hidden bg-ocean-950 py-16 text-white sm:py-20 lg:py-24" data-home-section id="about">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(110,172,201,0.16),transparent_34%),linear-gradient(180deg,rgba(11,40,66,0)_0%,rgba(19,62,98,0.32)_48%,rgba(11,40,66,0)_100%)]" aria-hidden="true" />
      <Container>
        <div className="relative grid gap-9 lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)] lg:items-center">
          <div className="max-w-2xl" data-section-anchor>
            <SectionHeader
              align="left"
              eyebrow={about[`about.eyebrow.${locale}` as keyof AboutSettings]}
              title={about[`about.title.${locale}` as keyof AboutSettings]}
              variant="feature"
            />
            <div className="mt-5 grid gap-4 text-[0.98rem] leading-7 text-ocean-100/90 sm:text-base sm:leading-8">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button className="gap-2.5" size="lg" variant="primary" to="/nosotros">
                <Users size={18} />
                {about[`about.preview_button_label.${locale}` as keyof AboutSettings]}
              </Button>
              <Button className="gap-2.5" size="lg" variant="glass" to="/tours">
                <Compass size={18} />
                {language === 'es' ? 'Explorar tours' : 'Explore our tours'}
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="about-glass-showcase relative aspect-[1.26/1] overflow-hidden rounded-[1.5rem] sm:aspect-[1.55/1] lg:aspect-[1.58/1]">
              {images.map((image, index) => (
                <img
                  key={image}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeImage ? 'opacity-100' : 'opacity-0'}`}
                  src={image}
                  alt={index === 0 ? about[`about.image_alt.${locale}` as keyof AboutSettings] : ''}
                  aria-hidden={index === 0 ? undefined : true}
                  loading="eager"
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

        <div className="relative mt-5 grid gap-4 md:grid-cols-3 lg:mt-5">
          {valueCards.map((card) => (
            <GlassPanel as="article" className="about-glass-card grid grid-cols-[auto_1fr] gap-4 p-5 sm:p-6" key={card.title.en} variant="subtle">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ocean-100 text-ocean-950 shadow-soft">
                <card.icon size={20} />
              </span>
              <span>
                <h3 className="text-lg font-extrabold leading-6 text-white">{card.title[language]}</h3>
                <p className="mt-2 text-sm leading-6 text-ocean-100/88">{card.description[language]}</p>
              </span>
            </GlassPanel>
          ))}
        </div>
      </Container>
    </section>
  );
}
