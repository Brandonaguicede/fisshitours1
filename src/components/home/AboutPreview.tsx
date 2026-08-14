import { Anchor, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { useLanguage } from '../../i18n/LanguageContext';

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

const aboutImages = [
  '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
  '/about/IMG_1020 (1).jpeg',
  '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
  '/galeria/IMG_9407.jpeg',
];

export function AboutPreview() {
  const { language } = useLanguage();
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveImage((index) => (index + 1) % aboutImages.length);
    }, 3400);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="section-y bg-ocean-900 text-white">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">
              {language === 'es' ? 'Sobre nosotros' : 'About us'}
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              {language === 'es'
                ? 'Local passion and excellence on Costa Rica Pacific'
                : 'Local passion and excellence on Costa Rica Pacific'}
            </h2>

            <div className="mt-6 grid max-w-3xl gap-4 text-base leading-8 text-ocean-200">
              <p>
                {language === 'es'
                  ? 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco.'
                  : 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco.'}
              </p>
              <p>
                {language === 'es'
                  ? 'Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity across the waters of the Papagayo Peninsula.'
                  : 'Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity across the waters of the Papagayo Peninsula.'}
              </p>
            </div>

          </div>

          <div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-lifted backdrop-blur-xl">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.4rem]">
                {aboutImages.map((image, index) => (
                  <img
                    key={image}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeImage ? 'opacity-100' : 'opacity-0'}`}
                    src={image}
                    alt={index === 0 ? (language === 'es' ? 'Tripulacion con pesca en aguas de Guanacaste' : 'Crew with a catch in Guanacaste waters') : ''}
                    aria-hidden={index === 0 ? undefined : true}
                    loading={index === 0 ? 'lazy' : 'eager'}
                  />
                ))}
                <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
                  {aboutImages.map((image, index) => (
                    <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" to="/nosotros">
                {language === 'es' ? 'Conocer la empresa' : 'Meet the company'}
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
