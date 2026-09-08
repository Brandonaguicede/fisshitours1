import { CheckCircle, Clock, Ship, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { Button } from '../components/ui';
import { Container } from '../components/common/Container';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { getTourPageText, getTourText } from '../i18n/content';
import { useLanguage } from '../i18n/LanguageContext';
import { getBookableTourBySlug, isBoatTour } from '../services/tourService';
import { boats } from '../data/boats';
import type { BoatTour } from '../types/boatTour';
import type { Tour } from '../types/tour';
import { getEffectiveMaxGuests } from '../utils/bookingPricing';
import { formatCurrency } from '../utils/formatCurrency';

export default function TourDetailPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { slug = '' } = useParams();
  const { data: item, isLoading } = useQuery({ queryKey: ['tour-detail', slug], queryFn: () => getBookableTourBySlug(slug) });

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!item) {
    return <Navigate to="/tours" replace />;
  }

  if (isBoatTour(item)) {
    const boat = boats.find((candidate) => candidate.id === item.boatId);
    return <BoatTourDetail tour={item} boatName={boat?.name ?? item.boatId} onReserve={() => navigate('/tours', { state: { tourId: item.id } })} />;
  }

  return <LegacyTourDetail tour={item} onReserve={() => navigate('/tours', { state: { tourId: item.slug } })} />;
}

function LegacyTourDetail({ tour, onReserve }: { tour: Tour; onReserve: () => void }) {
  const { language } = useLanguage();
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
            <span className="rounded-full border border-ocean-400/30 bg-ocean-500/10 px-4 py-2 text-sm font-bold text-ocean-300">{category}</span>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-tight text-white sm:text-6xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ocean-200">{description}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-ocean-200">
              <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                <Ship size={18} className="text-ocean-600" /> {tour.location}
              </span>
              {duration ? (
                <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                  <Clock size={18} className="text-ocean-600" /> {duration}
                </span>
              ) : null}
            </div>
          </div>
          <img className="aspect-[16/11] rounded-[2rem] object-cover shadow-lifted" src={tour.image} alt={title} />
        </Container>
      </section>

      <Container className="grid gap-10 pb-20 pt-6 lg:grid-cols-[1fr_380px]">
        <div className="glass-card rounded-[2rem] p-6 sm:p-8">
          <h2 className="text-3xl font-extrabold text-white">{language === 'es' ? 'Descripcion de la experiencia' : 'Experience Description'}</h2>
          <p className="mt-5 text-lg leading-8 text-ocean-200">{longDescription}</p>
          <h3 className="mt-10 text-2xl font-extrabold text-ocean-900">{language === 'es' ? 'Momentos destacados' : 'Highlights'}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <span key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-ocean-100">
                <CheckCircle className="shrink-0 text-ocean-600" size={20} /> {item}
              </span>
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-[2rem] bg-ocean-900 p-6 text-white shadow-lifted">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{language === 'es' ? 'Desde' : 'From'}</p>
          <p className="mt-2 text-4xl font-extrabold text-ocean-400">{formatCurrency(tour.price)}</p>
          <div className="mt-6 grid gap-3">
            {included.map((item) => (
              <span key={item} className="flex items-center gap-3 text-sm text-ocean-200">
                <CheckCircle className="shrink-0 text-seafoam-500" size={18} /> {item}
              </span>
            ))}
          </div>
          <Button className="mt-7 w-full" variant="secondary" onClick={onReserve}>
            {language === 'es' ? 'Reservar este tour' : 'Book this tour'}
          </Button>
        </aside>
      </Container>
    </article>
  );
}

function BoatTourDetail({ tour, boatName, onReserve }: { tour: BoatTour; boatName: string; onReserve: () => void }) {
  const { language } = useLanguage();
  const boat = boats.find((candidate) => candidate.id === tour.boatId);
  const display = getTourText(tour, language);
  const effectiveMaxGuests = boat ? getEffectiveMaxGuests(boat, tour) : undefined;

  return (
    <article>
      <section className="relative overflow-hidden">
        <Container className="grid gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="pb-4">
            <span className="rounded-full border border-ocean-400/30 bg-ocean-500/10 px-4 py-2 text-sm font-bold text-ocean-300">{display.category}</span>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-tight text-white sm:text-6xl">{display.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ocean-200">{tour.description}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-ocean-200">
              <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                <Ship size={18} className="text-ocean-600" /> {boatName}
              </span>
              {tour.duration ? (
                <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                  <Clock size={18} className="text-ocean-600" /> {tour.duration} {language === 'es' ? 'horas' : 'hours'}
                </span>
              ) : null}
              {effectiveMaxGuests ? (
                <span className="glass-card flex items-center gap-2 rounded-full px-4 py-2">
                  <Users size={18} className="text-ocean-600" /> {language === 'es' ? 'Hasta' : 'Up to'} {effectiveMaxGuests} {language === 'es' ? 'personas' : 'guests'}
                </span>
              ) : null}
            </div>
          </div>
          <img className="aspect-[16/11] rounded-[2rem] object-cover shadow-lifted" src={tour.image} alt={display.title} />
        </Container>
      </section>

      <Container className="grid gap-10 pb-20 pt-6 lg:grid-cols-[1fr_380px]">
        <div className="glass-card rounded-[2rem] p-6 sm:p-8">
          <h2 className="text-3xl font-extrabold text-white">{language === 'es' ? 'Descripcion de la experiencia' : 'Experience Description'}</h2>
          <p className="mt-5 text-lg leading-8 text-ocean-200">{tour.description}</p>
          <h3 className="mt-10 text-2xl font-extrabold text-ocean-900">{language === 'es' ? 'Actividades del paquete' : 'Package Activities'}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {display.activities.map((item) => (
              <span key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-ocean-100">
                <CheckCircle className="shrink-0 text-ocean-600" size={20} /> {item}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Horarios de salida' : 'Departure times'}</p>
              <div className="mt-2 grid gap-1.5">
                {tour.timeSlots.map((slot) => (
                  <span key={slot.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="font-bold text-white">{slot.label}</span>
                    <span className="font-extrabold text-ocean-400">{slot.time}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Capacidad y personas extra' : 'Capacity and extra guests'}</p>
              <p className="mt-2 text-sm leading-6 text-ocean-200">
                {language === 'es'
                  ? `Incluye ${tour.includedGuests ?? 5} personas. Maximo ${effectiveMaxGuests ?? 10}. Persona extra ${formatCurrency(tour.extraGuestPrice ?? 65)} cada una.`
                  : `Includes ${tour.includedGuests ?? 5} guests. Maximum ${effectiveMaxGuests ?? 10}. Additional guest ${formatCurrency(tour.extraGuestPrice ?? 65)} each.`}
              </p>
            </div>
          </div>
        </div>

        <aside className="h-fit rounded-[2rem] bg-ocean-900 p-6 text-white shadow-lifted">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{language === 'es' ? 'Desde' : 'From'}</p>
          <p className="mt-2 text-4xl font-extrabold text-ocean-400">{formatCurrency(tour.basePrice)}</p>
          <div className="mt-6 grid gap-3">
            {display.included.map((item) => (
              <span key={item} className="flex items-center gap-3 text-sm text-ocean-200">
                <CheckCircle className="shrink-0 text-seafoam-500" size={18} /> {item}
              </span>
            ))}
          </div>
          <Button className="mt-7 w-full" onClick={onReserve}>
            {language === 'es' ? 'Reservar este tour' : 'Book this tour'}
          </Button>
        </aside>
      </Container>
    </article>
  );
}
