import { useQuery } from '@tanstack/react-query';
import { MapPin, PenLine } from 'lucide-react';
import { useState } from 'react';

import { GOOGLE_MAPS_URL } from '../../constants/contact';
import { testimonials as fallbackTestimonials } from '../../data/testimonials';
import { useLanguage } from '../../i18n/LanguageContext';
import { getApprovedReviews } from '../../services/reviewService';
import { Container } from '../common/Container';
import { reveal } from '../common/SectionReveal';
import { Button, GlassPanel, SectionHeader } from '../ui';
import { ReviewModal } from './ReviewModal';
import { TestimonialsFlow, type DisplayReview } from './TestimonialsFlow';

export function Testimonials() {
  const { language } = useLanguage();
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewsQuery = useQuery({ queryKey: ['reviews', 'approved'], queryFn: () => getApprovedReviews(9) });

  const reviews: DisplayReview[] =
    reviewsQuery.data && reviewsQuery.data.length > 0
      ? reviewsQuery.data.map((review) => ({ id: review.id, name: review.name, country: review.country ?? '', quote: language === 'es' ? review.quote_es : review.quote_en, rating: review.rating, image_url: review.image_url, featured: review.featured }))
      : fallbackTestimonials.map((review) => ({ id: review.id, name: review.name, country: review.country, quote: language === 'es' ? review.quote_es : review.quote_en, rating: review.rating }));

  return (
    <section
      className="home-section section-y relative overflow-hidden bg-ocean-950"
      data-home-section
      data-nav-href="/#comments"
      id="comments"
    >

      <Container className="relative">
        <div data-nav-frame>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" {...reveal(0)}>
            <SectionHeader align="left" title={language === 'es' ? 'Historias que vuelven con sal' : 'Stories that come back with salt'} />
          </div>

          {reviewsQuery.isLoading ? (
            <TestimonialsSkeleton />
          ) : (
            <div className="mt-6" {...reveal(1)}>
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
    <div className="mt-6 grid h-[420px] gap-4 sm:h-[min(480px,58vh)] sm:grid-cols-2 lg:h-[min(560px,58vh)] lg:grid-cols-3 lg:gap-6">
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
