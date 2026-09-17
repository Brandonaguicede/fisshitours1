import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { groupTourCatalog } from '../../utils/tourCatalog';
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
  // Single source of truth for which tour card is "active" (hover/focus/
  // click/mobile-in-view) — lifted here instead of living as local state
  // per card, so activating one card is guaranteed to deactivate whatever
  // other card held it. Unrelated to `activeBoatId` above, which is the
  // boat filter — kept separately named to avoid confusion.
  const [activeTourCardId, setActiveTourCardId] = useState<string | null>(null);
  const visibleTours = useMemo(() => activeBoatId === 'all' ? tours : tours.filter((tour) => tour.boatId === activeBoatId), [activeBoatId, tours]);
  const groupedTours = useMemo(() => groupTourCatalog(visibleTours, boats), [visibleTours, boats]);
  const { scrollerRef, canScrollLeft, canScrollRight, updateControls, scrollByCards } = useCardCarousel(groupedTours);
  const selectedTourIndex = selectedTour ? groupedTours.findIndex((item) => item.boatOptions.some((option) => option.packages.some((tour) => tour.id === selectedTour.id))) : -1;

  const handleTourCardActiveChange = useCallback((tourId: string, active: boolean) => {
    setActiveTourCardId((current) => (active ? tourId : (current === tourId ? null : current)));
  }, []);

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
    scrollByCards(direction, 1);
  }

  return (
    <section className="home-section section-y bg-ocean-950" data-home-section data-nav-href="/#tours" id="tours">
      <SectionReveal variant="drift">
      <Container>
        <div data-nav-frame>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between" {...reveal(0)}>
            <SectionHeader align="left" title={tr(text.home.toursTitle, language)} />
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

          <div className="mt-4 sm:mt-5 [@media(min-width:1024px)_and_(max-height:800px)]:mt-2.5">
            <div
              ref={scrollerRef}
              className={cn(
                'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 min-[560px]:gap-5',
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
              {groupedTours.map((item) => (
                <div
                  key={item.tourId}
                  className="w-full shrink-0 snap-start snap-always min-[560px]:w-[calc((100%-20px)/2)] lg:w-[calc((100%-40px)/3)]"
                >
                  <BoatTourCard
                    catalogItem={item}
                    isActive={activeTourCardId === item.tourId}
                    isSelected={item.boatOptions.some((option) => option.packages.some((entry) => entry.id === selectedTour?.id))}
                    onActiveChange={handleTourCardActiveChange}
                    onSelect={onSelectTour}
                    scrollRootRef={scrollerRef}
                  />
                </div>
              ))}
            </div>

            {groupedTours.length === 0 ? <p role="status" className="py-8 text-center text-sm text-ocean-200">{language === 'es' ? 'No hay tours disponibles para este filtro.' : 'No tours available for this filter.'}</p> : null}

            {canScrollLeft || canScrollRight ? (
              <div className="mt-3 flex justify-center gap-3 sm:mt-3.5 [@media(min-width:1024px)_and_(max-height:800px)]:mt-1.5" aria-label={language === 'es' ? 'Controles del carrusel de tours' : 'Tour carousel controls'} {...reveal(2)}>
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
