import { tours } from '../../data/tours';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';
import { TourCard } from '../tours/TourCard';

export function FeaturedTours() {
  return (
    <section className="section-y scroll-mt-24" data-after-hero="true">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <SectionTitle
            align="left"
            eyebrow="Experiencias destacadas"
            title="Tours de playa, fishing y bioluminiscencia"
            description="Cada salida se puede reservar por turno o mezclar en un paquete personalizado: mañana en el mar, tarde de playa y noche luminosa."
          />
          <p className="max-w-xl text-base leading-7 text-stone-700 lg:justify-self-end">
            Si el grupo tiene gustos distintos, armamos una ruta 50/50: unos pescan, otros disfrutan playa, y todos cierran con una experiencia bien coordinada.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      </Container>
    </section>
  );
}
