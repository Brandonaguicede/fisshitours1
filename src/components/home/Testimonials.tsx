import { useQuery } from '@tanstack/react-query';
import { MapPin, PenLine } from 'lucide-react';
import { useState } from 'react';

import { testimonials as fallbackTestimonials } from '../../data/testimonials';
import { useLanguage } from '../../i18n/LanguageContext';
import { getApprovedReviews } from '../../services/reviewService';
import { Container } from '../common/Container';
import { reveal } from '../common/SectionReveal';
import { Button, GlassPanel, SectionHeader } from '../ui';
import { ReviewModal } from './ReviewModal';
import { TestimonialsFlow, type DisplayReview } from './TestimonialsFlow';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/D59oBAr9HaZfHCXY8';

export function Testimonials() {
  const { language } = useLanguage();
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewsQuery = useQuery({ queryKey: ['reviews', 'approved'], queryFn: () => getApprovedReviews(9) });

  const reviews: DisplayReview[] =
    reviewsQuery.data && reviewsQuery.data.length > 0
      ? reviewsQuery.data.map((review) => ({ id: review.id, name: review.name, country: review.country ?? '', quote: review.quote, rating: review.rating, image_url: review.image_url, featured: review.featured }))
      : fallbackTestimonials;

  return (
    <section
      className="home-section section-y relative overflow-hidden bg-[linear-gradient(180deg,#0B2842_0%,#061B2F_48%,#0B2842_100%)]"
      data-home-section
      data-nav-href="/#comments"
      id="comments"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ocean-300/35 to-transparent" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-ocean-500/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-28 bottom-10 h-80 w-80 rounded-full bg-seafoam-400/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/3 top-1/2 hidden h-24 w-24 rounded-full bg-ocean-300/[0.06] blur-2xl lg:block" aria-hidden="true" />

      <Container className="relative">
        <div data-nav-frame>
          <div {...reveal(0)}>
            <SectionHeader
              align="center"
              description={
                language === 'es'
                  ? 'Comentarios reales de quienes navegaron con nosotros en el Pacifico de Costa Rica.'
                  : "Real feedback from travelers who sailed with us on Costa Rica's Pacific coast."
              }
              eyebrow={language === 'es' ? 'Comentarios' : 'Reviews'}
              title={language === 'es' ? 'Historias que vuelven con sal' : 'Stories that come back with salt'}
              variant="compact"
            />
          </div>

          {reviewsQuery.isLoading ? (
            <TestimonialsSkeleton />
          ) : (
            <div className="mt-7" {...reveal(1)}>
              <TestimonialsFlow reviews={reviews} />
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
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

function TestimonialsSkeleton() {
  return (
    <div className="mt-7 grid h-[420px] gap-4 sm:h-[480px] sm:grid-cols-2 lg:h-[560px] lg:grid-cols-3 lg:gap-6">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className={index === 2 ? 'hidden gap-4 lg:flex lg:flex-col' : index === 1 ? 'hidden gap-4 sm:flex sm:flex-col' : 'flex flex-col gap-4'} key={index}>
          {Array.from({ length: 3 }).map((_, cardIndex) => (
            <GlassPanel className="animate-pulse p-4" key={cardIndex} variant="subtle">
              <div className="h-3 w-16 rounded-full bg-white/10" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded-full bg-white/10" />
                <div className="h-3 w-5/6 rounded-full bg-white/10" />
                <div className="h-3 w-3/5 rounded-full bg-white/10" />
              </div>
              <div className="mt-4 flex items-center gap-2.5 border-t border-white/10 pt-3">
                <div className="size-[34px] shrink-0 rounded-full bg-white/10" />
                <div className="h-3 w-20 rounded-full bg-white/10" />
              </div>
            </GlassPanel>
          ))}
        </div>
      ))}
    </div>
  );
}
