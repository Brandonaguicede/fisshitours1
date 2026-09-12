import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'framer-motion';
import { Star, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../utils/cn';
import { GlassPanel } from '../ui';

export interface DisplayReview {
  id: string;
  name: string;
  country: string;
  quote: string;
  rating: number;
  image_url?: string | null;
  featured?: boolean;
}

interface TestimonialsFlowProps {
  reviews: DisplayReview[];
}

// One card's vertical footprint is card-height + this gap — kept as a JS
// constant (not a Tailwind class) so the loop-measurement math below and the
// rendered gap always agree exactly, which is what keeps the wrap seamless.
const CARD_GAP = 16;

const COLUMN_MOTION = [
  { direction: 'up' as const, speed: 13 },
  { direction: 'down' as const, speed: 17 },
  { direction: 'up' as const, speed: 15 },
];

function useColumnCount() {
  const [count, setCount] = useState(() => {
    if (typeof window === 'undefined') return 3;
    if (window.matchMedia('(min-width: 1024px)').matches) return 3;
    if (window.matchMedia('(min-width: 640px)').matches) return 2;
    return 1;
  });

  useEffect(() => {
    const mqLg = window.matchMedia('(min-width: 1024px)');
    const mqSm = window.matchMedia('(min-width: 640px)');
    const update = () => setCount(mqLg.matches ? 3 : mqSm.matches ? 2 : 1);
    update();
    mqLg.addEventListener('change', update);
    mqSm.addEventListener('change', update);
    return () => {
      mqLg.removeEventListener('change', update);
      mqSm.removeEventListener('change', update);
    };
  }, []);

  return count;
}

function distributeColumns(reviews: DisplayReview[], columnCount: number): DisplayReview[][] {
  const columns: DisplayReview[][] = Array.from({ length: columnCount }, () => []);
  if (reviews.length === 0) return columns;

  const featuredIndex = reviews.findIndex((review) => review.featured);
  const rest = featuredIndex === -1 ? reviews : reviews.filter((_, index) => index !== featuredIndex);

  rest.forEach((review, index) => {
    columns[index % columnCount].push(review);
  });

  if (featuredIndex !== -1) {
    const centerColumn = Math.min(1, columnCount - 1);
    columns[centerColumn].unshift(reviews[featuredIndex]);
  }

  return columns.map((column) => (column.length > 0 ? column : rest.length > 0 ? [rest[0]] : column));
}

export function TestimonialsFlow({ reviews }: TestimonialsFlowProps) {
  const columnCount = useColumnCount();
  const reduceMotion = useReducedMotion();

  if (reviews.length === 0) return null;

  const columns = distributeColumns(reviews, columnCount);

  if (reduceMotion) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {columns.map((column, columnIndex) => (
          <div className="flex flex-col gap-4" key={columnIndex}>
            {column.map((review) => (
              <TestimonialCard featured={review.featured} key={review.id} review={review} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="relative h-[420px] overflow-hidden sm:h-[480px] lg:h-[560px]"
      style={{
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
      }}
    >
      <div className="grid h-full gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {columns.map((column, columnIndex) => (
          <VerticalColumn
            direction={COLUMN_MOTION[columnIndex % COLUMN_MOTION.length].direction}
            key={columnIndex}
            reviews={column}
            speed={COLUMN_MOTION[columnIndex % COLUMN_MOTION.length].speed}
          />
        ))}
      </div>
    </div>
  );
}

// Repeats real reviews (never invents content) so a column always has enough
// height to loop smoothly, even when only one or two real reviews exist.
function ensureMinimumItems(reviews: DisplayReview[], minItems: number): DisplayReview[] {
  if (reviews.length === 0) return reviews;
  const repeated: DisplayReview[] = [];
  for (let i = 0; repeated.length < minItems; i++) {
    repeated.push(reviews[i % reviews.length]);
  }
  return repeated;
}

function VerticalColumn({ reviews, direction, speed }: { reviews: DisplayReview[]; direction: 'up' | 'down'; speed: number }) {
  const loopReviews = ensureMinimumItems(reviews, 6);
  const setRef = useRef<HTMLDivElement>(null);
  const [setHeight, setSetHeight] = useState(0);
  const y = useMotionValue(0);
  const targetSpeed = useRef(speed);
  const currentSpeed = useRef(speed);
  const initializedOffset = useRef(false);

  useEffect(() => {
    const node = setRef.current;
    if (!node) return;
    const measure = () => {
      const height = node.offsetHeight + CARD_GAP;
      setSetHeight(height);
      if (!initializedOffset.current && height > 0) {
        initializedOffset.current = true;
        if (direction === 'down') y.set(-height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loopReviews, direction, y]);

  useAnimationFrame((_, delta) => {
    if (setHeight <= 0) return;
    currentSpeed.current += (targetSpeed.current - currentSpeed.current) * Math.min(1, delta / 260);
    const dir = direction === 'up' ? -1 : 1;
    let next = y.get() + dir * currentSpeed.current * (delta / 1000);
    if (dir === -1 && next <= -setHeight) next += setHeight;
    if (dir === 1 && next >= 0) next -= setHeight;
    y.set(next);
  });

  if (loopReviews.length === 0) return <div />;

  return (
    <div
      className="relative min-w-0 overflow-hidden"
      onMouseEnter={() => {
        targetSpeed.current = speed * 0.32;
      }}
      onMouseLeave={() => {
        targetSpeed.current = speed;
      }}
    >
      <motion.div className="flex flex-col" style={{ gap: CARD_GAP, y }}>
        <div className="flex flex-col" ref={setRef} style={{ gap: CARD_GAP }}>
          {loopReviews.map((review, index) => (
            <TestimonialCard featured={review.featured} key={`${review.id}-${index}`} review={review} />
          ))}
        </div>
        <div aria-hidden="true" className="flex flex-col" style={{ gap: CARD_GAP }}>
          {loopReviews.map((review, index) => (
            <TestimonialCard featured={review.featured} key={`${review.id}-${index}-loop`} review={review} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function TestimonialCard({ review, featured }: { review: DisplayReview; featured?: boolean }) {
  const { language } = useLanguage();
  const label = starLabel(review.rating, language);

  return (
    <figure>
      <GlassPanel
        className={cn('flex flex-col gap-3 p-4', featured && 'ring-1 ring-inset ring-ocean-200/20')}
        style={featured ? { boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 0 0 1px rgba(168, 211, 228, 0.1), 0 10px 30px -14px rgba(2, 18, 31, 0.55)' } : undefined}
        variant={featured ? 'active' : 'subtle'}
      >
        <Stars label={label} rating={review.rating} />
        <blockquote className="line-clamp-6 text-sm leading-6 text-ocean-100">&ldquo;{review.quote}&rdquo;</blockquote>
        <figcaption className="mt-1 flex items-center gap-2.5 border-t border-white/10 pt-3">
          <ReviewAvatar name={review.name} size={34} src={review.image_url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{review.name}</p>
            {review.country ? <p className="truncate text-xs font-medium text-ocean-300">{review.country}</p> : null}
          </div>
        </figcaption>
      </GlassPanel>
    </figure>
  );
}

function starLabel(count: number, language: 'es' | 'en') {
  return count === 1 ? (language === 'es' ? '1 estrella' : '1 star') : `${count} ${language === 'es' ? 'estrellas' : 'stars'}`;
}

function Stars({ rating, label, size = 15 }: { rating: number; label: string; size?: number }) {
  return (
    <div aria-label={label} className="flex gap-1 text-seafoam-400">
      {Array.from({ length: rating }).map((_, index) => (
        <Star aria-hidden="true" className="fill-current drop-shadow-[0_0_10px_rgba(226,168,109,0.2)]" key={index} size={size} />
      ))}
    </div>
  );
}

function ReviewAvatar({ name, src, size = 34 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    return <img alt="" className="shrink-0 rounded-full object-cover" decoding="async" height={size} loading="lazy" src={src} style={{ width: size, height: size }} width={size} />;
  }
  return (
    <div aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-ocean-300 to-ocean-600 text-ocean-950" style={{ width: size, height: size }}>
      <User size={Math.round(size * 0.42)} strokeWidth={2.6} />
    </div>
  );
}
