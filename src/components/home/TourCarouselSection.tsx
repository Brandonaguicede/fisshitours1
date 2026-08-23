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
  const [activeBoatId, setActiveBoatId] = useState<string>('all');
  const visibleTours = activeBoatId === 'all' ? tours : tours.filter((tour) => tour.boatId === activeBoatId);
  const groupedTours = groupToursForCards(visibleTours);
  const selectedTourIndex = selectedTour ? groupedTours.findIndex(({ relatedTours }) => relatedTours.some((tour) => tour.id === selectedTour.id)) : -1;

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollTo({ left: 0, behavior: 'smooth' });
    window.setTimeout(updateControls, 120);
  }, [groupedTours.length, activeBoatId]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || selectedTourIndex < 0) return;
    const selectedCard = element.children.item(selectedTourIndex) as HTMLElement | null;
    if (!selectedCard) return;
    const centeredLeft = selectedCard.offsetLeft - (element.clientWidth - selectedCard.clientWidth) / 2;
    element.scrollTo({ left: Math.max(0, centeredLeft), behavior: 'smooth' });
    window.setTimeout(updateControls, 320);
  }, [selectedTour?.id, selectedTourIndex]);

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
          <div className="flex items-center gap-3 self-end md:self-auto">
            <span className="hidden text-sm font-bold text-ocean-200 sm:inline">{groupedTours.length} {tr(text.home.toursAvailable, language)}</span>
            <button
              className="focus-ring glass-control glass-interactive grid h-10 w-10 place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-35"
              type="button"
              aria-label="Scroll tours left"
              disabled={!canScrollLeft}
              onClick={() => scrollByCard('left')}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="focus-ring glass-control glass-interactive grid h-10 w-10 place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-35"
              type="button"
              aria-label="Scroll tours right"
              disabled={!canScrollRight}
              onClick={() => scrollByCard('right')}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-6 flex snap-x gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={language === 'es' ? 'Filtrar tours por barco' : 'Filter tours by boat'}>
          <button
            className={cn(
              'focus-ring glass-interactive shrink-0 snap-start rounded-full px-4 py-2 text-sm font-extrabold',
              activeBoatId === 'all' ? 'glass-active text-ocean-950' : 'glass-control text-ocean-100 hover:text-white',
            )}
            type="button"
            onClick={() => setActiveBoatId('all')}
          >
            {language === 'es' ? 'Todos' : 'All'}
          </button>
          {boats.map((boat) => (
            <button
              key={boat.id}
              className={cn(
                'focus-ring glass-interactive shrink-0 snap-start rounded-full px-4 py-2 text-sm font-extrabold',
                activeBoatId === boat.id ? 'glass-active text-ocean-950' : 'glass-control text-ocean-100 hover:text-white',
              )}
              type="button"
              onClick={() => setActiveBoatId(boat.id)}
            >
              {boat.name}
            </button>
          ))}
        </div>

        <div className="relative mt-8">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 bg-gradient-to-r from-ocean-900/95 to-transparent md:block" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-ocean-900/95 to-transparent md:block" />
          <div
            ref={scrollerRef}
            className="flex cursor-grab snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-5 active:cursor-grabbing sm:gap-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={updateControls}
          >
            {groupedTours.map(({ key, tour, relatedTours }) => (
              <div key={key} className="min-w-[82%] snap-start min-[480px]:min-w-[68%] sm:min-w-[48%] lg:min-w-[31.5%]">
                <BoatTourCard boat={boats.find((boat) => boat.id === tour.boatId)!} tour={tour} relatedTours={relatedTours} isSelected={relatedTours.some((item) => item.id === selectedTour?.id)} onSelect={onSelectTour} />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function getTourGroupKey(tour: BoatTour) {
  if (tour.category === 'Bioluminescence Basic' || tour.category === 'Bioluminescence Deluxe') return `${tour.boatId}-Bioluminescence`;
  return `${tour.boatId}-${tour.category}`;
}

function groupToursForCards(tours: BoatTour[]) {
  const groups = new Map<string, BoatTour[]>();

  tours.forEach((tour) => {
    const key = getTourGroupKey(tour);
    groups.set(key, [...(groups.get(key) ?? []), tour]);
  });

  return Array.from(groups.entries()).map(([key, relatedTours]) => ({
    key,
    tour: [...relatedTours].sort((a, b) => a.basePrice - b.basePrice)[0],
    relatedTours: [...relatedTours].sort((a, b) => a.basePrice - b.basePrice),
  }));
}
