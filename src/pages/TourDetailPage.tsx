import { CheckCircle, Clock, MapPin, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';

import { Button } from '../components/common/Button';
import { Container } from '../components/common/Container';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { getTourBySlug } from '../services/tourService';
import { formatCurrency } from '../utils/formatCurrency';

export default function TourDetailPage() {
  const { slug = '' } = useParams();
  const { data: tour, isLoading } = useQuery({ queryKey: ['tour', slug], queryFn: () => getTourBySlug(slug) });

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!tour) {
    return <Navigate to="/tours" replace />;
  }

  return (
    <article>
      <section className="relative overflow-hidden">
        <Container className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="pb-4">
            <span className="rounded-full border border-ocean-400/30 bg-ocean-500/10 px-4 py-2 text-sm font-bold text-ocean-300">{tour.category}</span>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-tight text-white sm:text-6xl">{tour.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ocean-200">{tour.description}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-ocean-200">
              <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                <MapPin size={18} className="text-ocean-600" /> {tour.location}
              </span>
              <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                <Clock size={18} className="text-ocean-600" /> {tour.duration}
              </span>
              <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                <Star className="fill-amber-400 text-amber-400" size={18} /> {tour.rating}
              </span>
            </div>
          </div>
          <img className="aspect-[16/11] rounded-[2rem] object-cover shadow-lifted" src={tour.image} alt={tour.title} />
        </Container>
      </section>

      <Container className="grid gap-10 pb-20 pt-6 lg:grid-cols-[1fr_380px]">
        <div className="glass-card rounded-[2rem] p-6 sm:p-8">
          <h2 className="text-3xl font-extrabold text-white">Descripción de la experiencia</h2>
          <p className="mt-5 text-lg leading-8 text-ocean-200">{tour.longDescription}</p>
          <h3 className="mt-10 text-2xl font-extrabold text-ocean-900">Momentos destacados</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {tour.highlights.map((item) => (
              <span key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-ocean-100">
                <CheckCircle className="shrink-0 text-ocean-600" size={20} /> {item}
              </span>
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-[2rem] bg-ocean-900 p-6 text-white shadow-lifted">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">Desde</p>
          <p className="mt-2 text-4xl font-extrabold text-ocean-400">{formatCurrency(tour.price)}</p>
          <div className="mt-6 grid gap-3">
            {tour.included.map((item) => (
              <span key={item} className="flex items-center gap-3 text-sm text-ocean-200">
                <CheckCircle className="shrink-0 text-seafoam-500" size={18} /> {item}
              </span>
            ))}
          </div>
          <Button className="mt-7 w-full" variant="secondary" to="/tours">
            Reservar este tour
          </Button>
        </aside>
      </Container>
    </article>
  );
}



