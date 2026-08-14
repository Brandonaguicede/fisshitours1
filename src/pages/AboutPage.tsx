import { Anchor, HeartHandshake, ShieldCheck, SlidersHorizontal, Users, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../components/common/Button';
import { Container } from '../components/common/Container';
import { useLanguage } from '../i18n/LanguageContext';

const values = [
  {
    title: { es: 'Herencia local', en: 'Local heritage' },
    description: {
      es: 'Un equipo familiar apasionado con anos de experiencia navegando el mar costarricense.',
      en: 'A passionate family team with years of experience navigating Costa Rica waters.',
    },
    icon: Users,
  },
  {
    title: { es: 'Seguridad superior', en: 'Higher safety' },
    description: {
      es: 'Tripulacion profesional y protocolos rigurosos para navegar con tranquilidad.',
      en: 'Professional crew and rigorous protocols for a calm day at sea.',
    },
    icon: ShieldCheck,
  },
  {
    title: { es: 'A la medida', en: 'Tailored' },
    description: {
      es: 'Itinerarios flexibles: pesca de altura, snorkeling, playas y atardeceres.',
      en: 'Flexible itineraries: deep-sea fishing, snorkeling, beaches and sunsets.',
    },
    icon: SlidersHorizontal,
  },
];

const capabilities = [
  { icon: Anchor, label: { es: 'Pesca deportiva', en: 'Sport fishing' } },
  { icon: Waves, label: { es: 'Snorkeling y playa', en: 'Snorkeling and beach' } },
  { icon: HeartHandshake, label: { es: 'Servicio privado', en: 'Private service' } },
];

const teamPhotos = [
  {
    src: '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
    alt: { es: 'Tripulacion y cliente con pesca en Guanacaste', en: 'Crew and guest with a catch in Guanacaste' },
  },
  {
    src: '/about/IMG_1020 (1).jpeg',
    alt: { es: 'Tripulacion asistiendo una liberacion en alta mar', en: 'Crew assisting an offshore release' },
  },
  {
    src: '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
    alt: { es: 'Equipo y familia durante una salida de pesca', en: 'Crew and family during a fishing trip' },
  },
];

const aboutHeroImages = [
  '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
  '/about/IMG_1020 (1).jpeg',
  '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
  '/galeria/IMG_9407.jpeg',
];

export default function AboutPage() {
  const { language } = useLanguage();
  const [activeHeroImage, setActiveHeroImage] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveHeroImage((index) => (index + 1) % aboutHeroImages.length);
    }, 3400);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="bg-ocean-950 text-white">
      <section className="relative overflow-hidden pb-16 pt-32 sm:pt-36 lg:pb-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(110,172,201,0.28),transparent_28rem),linear-gradient(180deg,rgba(11,40,66,0.88),rgba(19,62,98,0.96))]" />
        <Container className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-ocean-200">
              {language === 'es' ? 'Sobre nosotros' : 'About us'}
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl lg:text-7xl">
              {language === 'es'
                ? 'Local passion and excellence on Costa Rica Pacific'
                : 'Local passion and excellence on Costa Rica Pacific'}
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-ocean-100">
              {language === 'es'
                ? 'Step aboard Second Wind and discover a sophisticated ocean experience where luxury meets nature.'
                : 'Step aboard Second Wind and discover a sophisticated ocean experience where luxury meets nature.'}
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-lifted backdrop-blur-xl">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.4rem]">
              {aboutHeroImages.map((image, index) => (
                <img
                  key={image}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeHeroImage ? 'opacity-100' : 'opacity-0'}`}
                  src={image}
                  alt={index === 0 ? (language === 'es' ? 'Tripulacion con pesca en aguas de Guanacaste' : 'Crew with a catch in Guanacaste waters') : ''}
                  aria-hidden={index === 0 ? undefined : true}
                  loading={index === 0 ? 'lazy' : 'eager'}
                />
              ))}
              <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
                {aboutHeroImages.map((image, index) => (
                  <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === activeHeroImage ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section-y bg-ocean-900">
        <Container className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-soft backdrop-blur-xl sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-300">
              {language === 'es' ? 'Nuestra forma de navegar' : 'How we operate'}
            </p>
            <div className="mt-5 grid gap-5 text-base leading-8 text-ocean-100">
              <p>
                {language === 'es'
                  ? 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco. Driven by a deep connection to the ocean, they have redefined fishing experiences in the waters of the Papagayo Peninsula.'
                  : 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco. Driven by a deep connection to the ocean, they have redefined fishing experiences in the waters of the Papagayo Peninsula.'}
              </p>
              <p>
                {language === 'es'
                  ? 'Sail across crystal-clear seas renowned for world-class fishing, surfing and snorkeling. Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity.'
                  : 'Sail across crystal-clear seas renowned for world-class fishing, surfing and snorkeling. Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {capabilities.map((item) => (
              <div key={item.label.en} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-soft backdrop-blur-xl">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-ocean-600">
                  <item.icon size={22} />
                </span>
                <p className="text-lg font-extrabold text-white">{item.label[language]}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="section-y bg-ocean-950">
        <Container>
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-lifted backdrop-blur-xl">
            <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
              <div className="p-6 sm:p-8 lg:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-300">
                  {language === 'es' ? 'Grupo de trabajo' : 'Our crew'}
                </p>
                <h2 className="mt-3 max-w-2xl font-display text-4xl font-extrabold leading-tight text-white">
                  {language === 'es' ? 'Un equipo local que conoce cada salida' : 'A local team that knows every departure'}
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-ocean-200">
                  {language === 'es'
                    ? 'Whether pursuing trophy fish or exploring vibrant marine life, each experience is personalized and handled with care. Our highly trained crew and strict safety standards ensure a seamless and unforgettable adventure.'
                    : 'Whether pursuing trophy fish or exploring vibrant marine life, each experience is personalized and handled with care. Our highly trained crew and strict safety standards ensure a seamless and unforgettable adventure.'}
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    language === 'es' ? 'Capitan local' : 'Local captain',
                    language === 'es' ? 'Asistencia a bordo' : 'Onboard support',
                    language === 'es' ? 'Coordinacion clara' : 'Clear coordination',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-extrabold text-ocean-100">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative min-h-[360px] overflow-hidden bg-ocean-900/60 p-3">
                <div className="flex h-full min-h-[336px] animate-[team-carousel_18s_linear_infinite] gap-3 will-change-transform hover:[animation-play-state:paused]">
                  {[...teamPhotos, ...teamPhotos].map((photo, index) => (
                    <img
                      key={`${photo.src}-${index}`}
                      className="h-[336px] w-[78%] shrink-0 rounded-[1.4rem] object-cover shadow-soft sm:w-[62%] lg:h-full lg:w-[72%]"
                      src={photo.src}
                      alt={photo.alt[language]}
                      loading="lazy"
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ocean-900/80 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ocean-900/80 to-transparent" />
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section-y bg-ocean-950">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {values.map((value) => (
              <article key={value.title.en} className="group rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-300/60 hover:bg-white/[0.1] hover:shadow-lifted">
                <value.icon className="text-ocean-300 transition duration-300 group-hover:scale-105" size={30} />
                <h2 className="mt-5 text-xl font-extrabold text-white">{value.title[language]}</h2>
                <p className="mt-3 text-sm leading-6 text-ocean-200">{value.description[language]}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 rounded-[2rem] border border-white/10 bg-ocean-900 p-6 text-center shadow-lifted sm:p-10">
            <h2 className="font-display text-4xl font-extrabold leading-tight text-white">
              {language === 'es' ? 'Listo para planear tu salida?' : 'Ready to plan your trip?'}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ocean-200">
              {language === 'es'
                ? 'Elige tu barco, horario y tipo de experiencia. Nosotros nos encargamos del resto.'
                : 'Choose your boat, time and experience. We handle the rest.'}
            </p>
            <Button className="mt-7" to="/#booking">
              {language === 'es' ? 'Reservar ahora' : 'Book now'}
            </Button>
          </div>
        </Container>
      </section>
    </main>
  );
}
