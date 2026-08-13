import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { BoatTourCard } from '../tours/BoatTourCard';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';
import { cn } from '../../utils/cn';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';

interface TourCarouselSectionProps {
  boats: Boat[];
  tours: BoatTour[];
  selectedTour?: BoatTour;
  onSelectTour: (tour: BoatTour) => void;
}

export function TourCarouselSection({ boats, tours, selectedTour, onSelectTour }: TourCarouselSectionProps) {
  const { language } = useLanguage();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollTo({ left: 0, behavior: 'smooth' });
    window.setTimeout(updateControls, 120);
  }, [tours.length]);

  function updateControls() {
    const element = scrollerRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 8);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 8);
  }

  function scrollByCard(direction: 'left' | 'right') {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollBy({ left: direction === 'right' ? element.clientWidth * 0.82 : -element.clientWidth * 0.82, behavior: 'smooth' });
  }

  return (
    <section className="section-y scroll-mt-24 bg-ocean-900/55" id="tours">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionTitle
            align="left"
            eyebrow="Tours"
            title={tr(text.home.toursTitle, language)}
          />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-bold text-ocean-200 sm:inline">{tours.length} {tr(text.home.toursAvailable, language)}</span>
            <button
              className={cn('focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-35', canScrollLeft && 'hover:border-ocean-400 hover:bg-white/15 hover:text-ocean-300')}
              type="button"
              aria-label="Scroll tours left"
              disabled={!canScrollLeft}
              onClick={() => scrollByCard('left')}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className={cn('focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-35', canScrollRight && 'hover:border-ocean-400 hover:bg-white/15 hover:text-ocean-300')}
              type="button"
              aria-label="Scroll tours right"
              disabled={!canScrollRight}
              onClick={() => scrollByCard('right')}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <div className="relative mt-8">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 bg-gradient-to-r from-ocean-900/95 to-transparent md:block" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-ocean-900/95 to-transparent md:block" />
          <div
            ref={scrollerRef}
            className="flex cursor-grab snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-1 pb-5 active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={updateControls}
          >
            {tours.map((tour) => (
              <div key={tour.id} className="min-w-[84%] snap-start sm:min-w-[48%] lg:min-w-[31%] xl:min-w-[29%]">
                <BoatTourCard boat={boats.find((boat) => boat.id === tour.boatId)!} tour={tour} isSelected={tour.id === selectedTour?.id} onSelect={onSelectTour} />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
