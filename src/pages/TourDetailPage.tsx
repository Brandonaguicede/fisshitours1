import { CheckCircle, Clock, MapPin, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';

import { Container } from '../components/common/Container';
import { Button, Chip, GlassPanel, SectionHeader } from '../components/ui';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { getTourBySlug } from '../services/tourService';
import { getTourPageText } from '../i18n/content';
import { useLanguage } from '../i18n/LanguageContext';
import { formatCurrency } from '../utils/formatCurrency';

export default function TourDetailPage() {
  const { language } = useLanguage();
  const { slug = '' } = useParams();
  const { data: tour, isLoading } = useQuery({ queryKey: ['tour', slug], queryFn: () => getTourBySlug(slug) });

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!tour) {
    return <Navigate to="/tours" replace />;
  }
  const localized = getTourPageText(tour.slug, language);
  const title = localized?.title ?? tour.title;
  const category = localized?.category ?? tour.category;
  const description = localized?.description ?? tour.description;
  const longDescription = localized?.longDescription ?? tour.longDescription;
  const duration = localized?.duration ?? tour.duration;
  const highlights = localized?.highlights ?? tour.highlights;
  const included = localized?.included ?? tour.included;

  return (
    <article>
      <section className="relative overflow-hidden">
        <Container className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="pb-4">
            <SectionHeader align="left" description={description} eyebrow={category} level={1} title={title} variant="hero" />
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-ocean-200">
              <Chip className="gap-2 px-4 py-2">
                <MapPin size={18} className="text-ocean-600" /> {tour.location}
              </Chip>
              {duration ? (
                <Chip className="gap-2 px-4 py-2">
                  <Clock size={18} className="text-ocean-600" /> {duration}
                </Chip>
              ) : null}
              <Chip className="gap-2 px-4 py-2">
                <Star className="fill-amber-400 text-amber-400" size={18} /> {tour.rating}
              </Chip>
            </div>
          </div>
          <img className="aspect-[16/11] rounded-[2rem] object-cover shadow-lifted" src={tour.image} alt={title} />
        </Container>
      </section>

      <Container className="grid gap-10 pb-20 pt-6 lg:grid-cols-[1fr_380px]">
        <GlassPanel className="p-6 sm:p-8" variant="surface">
          <h2 className="text-3xl font-extrabold text-white">{language === 'es' ? 'Descripcion de la experiencia' : 'Experience Description'}</h2>
          <p className="mt-5 text-lg leading-8 text-ocean-200">{longDescription}</p>
          <h3 className="mt-10 text-2xl font-extrabold text-ocean-900">{language === 'es' ? 'Momentos destacados' : 'Highlights'}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <Chip key={item} className="gap-3 rounded-2xl p-4 text-ocean-100">
                <CheckCircle className="shrink-0 text-ocean-600" size={20} /> {item}
              </Chip>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel as="aside" className="h-fit p-6 text-white" variant="panel">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{language === 'es' ? 'Desde' : 'From'}</p>
          <p className="mt-2 text-4xl font-extrabold text-ocean-400">{formatCurrency(tour.price)}</p>
          <div className="mt-6 grid gap-3">
            {included.map((item) => (
              <span key={item} className="flex items-center gap-3 text-sm text-ocean-200">
                <CheckCircle className="shrink-0 text-seafoam-500" size={18} /> {item}
              </span>
            ))}
          </div>
          <Button className="mt-7 w-full" variant="glass" to="/tours">
            {language === 'es' ? 'Reservar este tour' : 'Book this tour'}
          </Button>
        </GlassPanel>
      </Container>
    </article>
  );
}



