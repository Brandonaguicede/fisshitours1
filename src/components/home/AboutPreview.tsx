import { Anchor, ShieldCheck, SlidersHorizontal } from 'lucide-react';

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

export function AboutPreview() {
  const { language } = useLanguage();

  return (
    <section className="section-y bg-ocean-900 text-white">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">
              {language === 'es' ? 'Sobre nosotros' : 'About us'}
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              {language === 'es'
                ? 'Pasion local y excelencia en el Pacifico costarricense'
                : 'Local passion and excellence on Costa Rica Pacific'}
            </h2>

            <div className="mt-6 grid max-w-3xl gap-4 text-base leading-8 text-ocean-200">
              <p>
                {language === 'es'
                  ? 'En Papagayo Fishing Tour, transformamos la navegacion en experiencias memorables. Nacimos del amor por el oceano y el conocimiento profundo de las aguas de Guanacaste, ofreciendo charters privados de pesca deportiva, snorkeling y navegacion de lujo.'
                  : 'At Papagayo Fishing Tour, we transform navigation into memorable experiences. Born from a love for the ocean and deep knowledge of Guanacaste waters, we offer private sport fishing, snorkeling and luxury navigation charters.'}
              </p>
              <p>
                {language === 'es'
                  ? 'Disenamos cada salida a la medida para que puedas desconectar, conectar con la naturaleza y disfrutar de la Peninsula de Papagayo con total confort, flexibilidad y seguridad.'
                  : 'We design every departure around you, so you can disconnect, connect with nature and enjoy the Papagayo Peninsula with comfort, flexibility and safety.'}
              </p>
            </div>

            <div className="mt-7 flex justify-start">
              <Button variant="secondary" to="/nosotros">
                {language === 'es' ? 'Conocer la empresa' : 'Meet the company'}
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-lifted backdrop-blur-xl">
            <img
              className="aspect-[4/3] w-full rounded-[1.4rem] object-cover"
              src="/images/placeholder-image.jpg"
              alt={language === 'es' ? 'Bote privado en agua tropical' : 'Private boat on tropical water'}
              loading="lazy"
            />
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
