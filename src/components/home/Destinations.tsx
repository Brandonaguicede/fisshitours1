import { useQuery } from '@tanstack/react-query';

import { destinations } from '../../data/destinations';
import { supabase } from '../../lib/supabase';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';

export function Destinations() {
  const destinationsQuery = useQuery({
    queryKey: ['destinations', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destinations')
        .select('id, name, region, image_url, description')
        .eq('active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []).map((destination) => ({
        id: destination.id,
        name: destination.name,
        region: destination.region ?? '',
        image: destination.image_url ?? '/images/placeholder-image.jpg',
        description: destination.description ?? '',
      }));
    },
  });
  const visibleDestinations = destinationsQuery.data && destinationsQuery.data.length > 0 ? destinationsQuery.data : destinations;

  return (
    <section className="section-y scroll-mt-24" id="gallery">
      <Container>
        <SectionTitle eyebrow="Zonas de operación" title="Costa, islas y playas listas para armar tu ruta" />
        <div className="mt-12 grid gap-5 md:grid-cols-6">
          {visibleDestinations.map((destination, index) => (
            <article
              key={destination.id}
              className={index === 0 || index === 3 ? 'group relative overflow-hidden rounded-4xl shadow-soft md:col-span-3 lg:col-span-2' : 'group relative overflow-hidden rounded-4xl shadow-soft md:col-span-3 lg:col-span-1'}
            >
              <img
                className="aspect-[4/5] h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105"
                src={destination.image}
                alt={destination.name}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ocean-950/80 via-ocean-900/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean-200">{destination.region}</p>
                <h3 className="mt-2 text-2xl font-extrabold">{destination.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/80">{destination.description}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
