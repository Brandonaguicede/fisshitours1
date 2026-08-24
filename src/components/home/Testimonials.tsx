import { useQuery } from '@tanstack/react-query';
import { MapPin, PenLine, Quote, Star, User } from 'lucide-react';
import { useState } from 'react';

import { testimonials as fallbackTestimonials } from '../../data/testimonials';
import { useLanguage } from '../../i18n/LanguageContext';
import { getApprovedReviews } from '../../services/reviewService';
import { Container } from '../common/Container';
import { Button, CardContent, CardShell, GlassPanel, SectionHeader } from '../ui';
import { ReviewModal } from './ReviewModal';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/D59oBAr9HaZfHCXY8';

interface DisplayReview {
  id: string;
  name: string;
  country: string;
  quote: string;
  rating: number;
  image_url?: string | null;
}

export function Testimonials() {
  const { language } = useLanguage();
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewsQuery = useQuery({ queryKey: ['reviews', 'approved'], queryFn: () => getApprovedReviews(6) });

  const reviews: DisplayReview[] =
    reviewsQuery.data && reviewsQuery.data.length > 0
      ? reviewsQuery.data.map((review) => ({ id: review.id, name: review.name, country: review.country ?? '', quote: review.quote, rating: review.rating, image_url: review.image_url }))
      : fallbackTestimonials;

  const starLabel = (count: number) =>
    count === 1 ? (language === 'es' ? '1 estrella' : '1 star') : `${count} ${language === 'es' ? 'estrellas' : 'stars'}`;

  return (
    <section
      className="home-section section-y relative overflow-hidden bg-[linear-gradient(180deg,#0B2842_0%,#061B2F_48%,#0B2842_100%)]"
      data-home-section
      id="comments"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ocean-300/35 to-transparent" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-ocean-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-80 w-80 rounded-full bg-seafoam-400/10 blur-3xl" />

      <Container className="relative">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <SectionHeader
            align="left"
            eyebrow={language === 'es' ? 'Comentarios' : 'Reviews'}
            title={language === 'es' ? 'Historias que vuelven con sal' : 'Stories that come back with salt'}
            description={language === 'es'
              ? 'Comentarios reales de quienes navegaron con nosotros en el Pacifico de Costa Rica.'
              : 'Real feedback from travelers who sailed with us on Costa Rica\'s Pacific coast.'}
          />

          <GlassPanel className="p-4 sm:p-5" variant="surface">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: '5.0', label: language === 'es' ? 'promedio' : 'average' },
                { value: reviews.length.toString().padStart(2, '0'), label: language === 'es' ? 'comentarios' : 'reviews' },
                { value: 'CR', label: language === 'es' ? 'Pacifico norte' : 'North Pacific' },
              ].map((item) => (
                <GlassPanel className="px-4 py-3" key={item.label} variant="subtle">
                  <p className="font-serifDisplay text-3xl italic leading-none text-ocean-200">{item.value}</p>
                  <p className="mt-1 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-ocean-400">{item.label}</p>
                </GlassPanel>
              ))}
            </div>
          </GlassPanel>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviewsQuery.isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <GlassPanel key={index} className="animate-pulse p-6" variant="surface">
                  <div className="h-4 w-24 rounded-full bg-white/10" />
                  <div className="mt-5 space-y-2">
                    <div className="h-3 w-full rounded-full bg-white/10" />
                    <div className="h-3 w-4/5 rounded-full bg-white/10" />
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="h-3 w-28 rounded-full bg-white/10" />
                    <div className="h-2.5 w-16 rounded-full bg-white/10" />
                  </div>
                </GlassPanel>
              ))
            : reviews.map((review) => (
                <CardShell as="article" className="group relative" key={review.id}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ocean-400 via-seafoam-400 to-transparent opacity-70" />
                  <CardContent className="p-6 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-1 text-seafoam-400" aria-label={starLabel(review.rating)}>
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={index} className="fill-current drop-shadow-[0_0_12px_rgba(226,168,109,0.24)]" size={16} />
                      ))}
                    </div>
                    <GlassPanel className="grid h-10 w-10 shrink-0 place-items-center text-ocean-300 transition-colors duration-300 group-hover:text-seafoam-400" shape="circle" variant="subtle">
                      <Quote size={18} />
                    </GlassPanel>
                  </div>
                  <p className="mt-5 text-lg font-medium leading-8 text-ocean-100">"{review.quote}"</p>
                  <div className="mt-7 flex items-center gap-3 border-t border-white/10 pt-5">
                    {review.image_url ? (
                      <img className="h-11 w-11 rounded-full object-cover" src={review.image_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-ocean-300 to-ocean-600 text-ocean-950" aria-hidden="true">
                        <User size={18} strokeWidth={2.6} />
                      </div>
                    )}
                    <div>
                      <p className="font-extrabold text-white">{review.name}</p>
                      {review.country ? <p className="text-sm font-medium text-ocean-300">{review.country}</p> : null}
                    </div>
                  </div>
                  </CardContent>
                </CardShell>
              ))}
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button type="button" onClick={() => setReviewOpen(true)}>
            <PenLine size={16} />
            {language === 'es' ? 'Deja tu comentario' : 'Leave a review'}
          </Button>
          <Button href={GOOGLE_MAPS_URL} target="_blank" variant="glass">
            <MapPin size={16} />
            {language === 'es' ? 'Encuentranos en Google Maps' : 'Find us on Google Maps'}
          </Button>
        </div>
      </Container>

      <ReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
