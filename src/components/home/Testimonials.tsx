import { useQuery } from '@tanstack/react-query';
import { MapPin, PenLine, Quote, Star, User } from 'lucide-react';
import { useState } from 'react';

import { testimonials as fallbackTestimonials } from '../../data/testimonials';
import { useLanguage } from '../../i18n/LanguageContext';
import { getApprovedReviews } from '../../services/reviewService';
import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';
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
      className="section-y relative scroll-mt-24 overflow-hidden bg-[linear-gradient(180deg,#0B2842_0%,#061B2F_48%,#0B2842_100%)]"
      id="comments"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ocean-300/35 to-transparent" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-ocean-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-80 w-80 rounded-full bg-seafoam-400/10 blur-3xl" />

      <Container className="relative">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <SectionTitle
            align="left"
            eyebrow={language === 'es' ? 'Comentarios' : 'Reviews'}
            title={language === 'es' ? 'Historias que vuelven con sal' : 'Stories that come back with salt'}
            description={language === 'es'
              ? 'Comentarios reales de quienes navegaron con nosotros en el Pacifico de Costa Rica.'
              : 'Real feedback from travelers who sailed with us on Costa Rica\'s Pacific coast.'}
          />

          <div className="rounded-4xl border border-white/15 bg-white/[0.06] p-4 shadow-soft backdrop-blur-xl sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: '5.0', label: language === 'es' ? 'promedio' : 'average' },
                { value: reviews.length.toString().padStart(2, '0'), label: language === 'es' ? 'comentarios' : 'reviews' },
                { value: 'CR', label: language === 'es' ? 'Pacifico norte' : 'North Pacific' },
              ].map((item) => (
                <div className="rounded-[1.25rem] border border-white/10 bg-ocean-950/45 px-4 py-3" key={item.label}>
                  <p className="font-serifDisplay text-3xl italic leading-none text-ocean-200">{item.value}</p>
                  <p className="mt-1 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-ocean-400">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviewsQuery.isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="glass-card animate-pulse rounded-4xl p-6">
                  <div className="h-4 w-24 rounded-full bg-white/10" />
                  <div className="mt-5 space-y-2">
                    <div className="h-3 w-full rounded-full bg-white/10" />
                    <div className="h-3 w-4/5 rounded-full bg-white/10" />
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="h-3 w-28 rounded-full bg-white/10" />
                    <div className="h-2.5 w-16 rounded-full bg-white/10" />
                  </div>
                </div>
              ))
            : reviews.map((review) => (
                <article className="group relative overflow-hidden rounded-4xl border border-white/15 bg-white/[0.08] p-6 shadow-soft backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:border-ocean-300/40 hover:bg-white/[0.11] hover:shadow-lifted" key={review.id}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ocean-400 via-seafoam-400 to-transparent opacity-70" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-1 text-seafoam-400" aria-label={starLabel(review.rating)}>
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={index} className="fill-current drop-shadow-[0_0_12px_rgba(226,168,109,0.24)]" size={16} />
                      ))}
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-ocean-300 transition-colors duration-300 group-hover:text-seafoam-400">
                      <Quote size={18} />
                    </span>
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
                </article>
              ))}
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button className="gap-2 px-6" type="button" onClick={() => setReviewOpen(true)}>
            <PenLine size={16} />
            {language === 'es' ? 'Deja tu comentario' : 'Leave a review'}
          </Button>
          <a
            className="focus-ring pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-ocean-300/60 hover:bg-white/15 hover:shadow-lifted"
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={16} />
            {language === 'es' ? 'Encuentranos en Google Maps' : 'Find us on Google Maps'}
          </a>
        </div>
      </Container>

      <ReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
