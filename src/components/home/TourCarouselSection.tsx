import { useEffect, useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getVisibleCardCount, useCardCarousel } from '../../hooks/useCardCarousel';
import { BoatTourCard } from '../tours/BoatTourCard';
import { Container } from '../common/Container';
import { cn } from '../../utils/cn';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { CarouselArrow, FilterMenu, SectionHeader } from '../ui';
import { reveal, SectionReveal } from '../common/SectionReveal';

interface TourCarouselSectionProps {
  boats: Boat[];
  tours: BoatTour[];
  selectedTour?: BoatTour;
  onSelectTour: (tour: BoatTour) => void;
}

export function TourCarouselSection({ boats, tours, selectedTour, onSelectTour }: TourCarouselSectionProps) {
  const { language } = useLanguage();
  const [visibleCardCount, setVisibleCardCount] = useState(getVisibleCardCount);
  const [activeBoatId, setActiveBoatId] = useState<string>('all');
  const visibleTours = activeBoatId === 'all' ? tours : tours.filter((tour) => tour.boatId === activeBoatId);
  const groupedTours = groupToursForCards(visibleTours);
  const { scrollerRef, canScrollLeft, canScrollRight, updateControls, scrollByCards } = useCardCarousel(groupedTours);
  const selectedTourIndex = selectedTour ? groupedTours.findIndex(({ relatedTours }) => relatedTours.some((tour) => tour.id === selectedTour.id)) : -1;

  useEffect(() => {
    const updateVisibleCardCount = () => setVisibleCardCount(getVisibleCardCount());
    updateVisibleCardCount();
    window.addEventListener('resize', updateVisibleCardCount);
    return () => window.removeEventListener('resize', updateVisibleCardCount);
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollTo({ left: 0, behavior: 'auto' });
    const frame = window.requestAnimationFrame(updateControls);
    return () => window.cancelAnimationFrame(frame);
  }, [groupedTours.length, activeBoatId, updateControls, visibleCardCount]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || selectedTourIndex < 0) return;
    const maximumStartIndex = Math.max(0, groupedTours.length - visibleCardCount);
    const targetIndex = Math.min(
      Math.max(0, selectedTourIndex - Math.floor((visibleCardCount - 1) / 2)),
      maximumStartIndex,
    );
    scrollToCard(element, targetIndex, 'smooth');
    const timeout = window.setTimeout(updateControls, 320);
    return () => window.clearTimeout(timeout);
  }, [groupedTours.length, selectedTour?.id, selectedTourIndex, updateControls, visibleCardCount]);

  function scrollByCard(direction: 'left' | 'right') {
    scrollByCards(direction, visibleCardCount);
  }

  return (
    <section className="home-section tours-ocean-atmosphere pb-10 pt-0 sm:pb-12 sm:pt-6 lg:pb-14 lg:pt-8" data-home-section data-nav-href="/#tours" id="tours">
      <SectionReveal variant="drift">
      <Container>
        <div data-nav-frame>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between" {...reveal(0)}>
            <SectionHeader
              align="left"
              eyebrow="Tours"
              title={tr(text.home.toursTitle, language)}
            />
            <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
              <span className="text-sm font-bold text-ocean-200">{groupedTours.length} {tr(text.home.toursAvailable, language)}</span>
              {boats.length > 1 ? (
                <FilterMenu
                  label={language === 'es' ? 'Barco' : 'Boat'}
                  ariaLabel={language === 'es' ? 'Filtrar tours por barco' : 'Filter tours by boat'}
                  clearLabel={language === 'es' ? 'Ver todos' : 'Clear filter'}
                  clearValue="all"
                  value={activeBoatId}
                  onChange={setActiveBoatId}
                  options={[
                    { value: 'all', label: language === 'es' ? 'Todos' : 'All' },
                    ...boats.map((boat) => ({ value: boat.id, label: boat.name })),
                  ]}
                />
              ) : null}
            </div>
          </div>

          <div className="mt-4 sm:mt-5">
            <div
              ref={scrollerRef}
              className={cn(
                'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 sm:gap-5',
                'overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                groupedTours.length < visibleCardCount && 'justify-center',
              )}
              role="region"
              tabIndex={0}
              aria-label={language === 'es' ? 'Tours disponibles' : 'Available tours'}
              onScroll={updateControls}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                scrollByCard(event.key === 'ArrowLeft' ? 'left' : 'right');
              }}
              {...reveal(1)}
            >
              {groupedTours.map(({ key, tour, relatedTours }) => (
                <div
                  key={key}
                  className="w-full shrink-0 snap-start snap-always sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
                >
                  <BoatTourCard boat={boats.find((boat) => boat.id === tour.boatId)!} tour={tour} relatedTours={relatedTours} isSelected={relatedTours.some((item) => item.id === selectedTour?.id)} onSelect={onSelectTour} />
                </div>
              ))}
            </div>

            {canScrollLeft || canScrollRight ? (
              <div className="mt-3 flex justify-center gap-3 sm:mt-3.5" aria-label={language === 'es' ? 'Controles del carrusel de tours' : 'Tour carousel controls'} {...reveal(2)}>
                <CarouselArrow direction="left" disabled={!canScrollLeft} label={language === 'es' ? 'Tours anteriores' : 'Previous tours'} onClick={() => scrollByCard('left')} />
                <CarouselArrow direction="right" disabled={!canScrollRight} label={language === 'es' ? 'Más tours' : 'Next tours'} onClick={() => scrollByCard('right')} />
              </div>
            ) : null}
          </div>
        </div>
      </Container>
      </SectionReveal>
    </section>
  );
}

function scrollToCard(element: HTMLDivElement, cardIndex: number, behavior: ScrollBehavior) {
  const firstCard = element.children.item(0) as HTMLElement | null;
  const card = element.children.item(cardIndex) as HTMLElement | null;
  element.scrollTo({ left: card && firstCard ? card.offsetLeft - firstCard.offsetLeft : 0, behavior });
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
