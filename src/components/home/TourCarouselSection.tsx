import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [visibleCardCount, setVisibleCardCount] = useState(getVisibleCardCount);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeBoatId, setActiveBoatId] = useState<string>('all');
  const visibleTours = activeBoatId === 'all' ? tours : tours.filter((tour) => tour.boatId === activeBoatId);
  const groupedTours = groupToursForCards(visibleTours);
  const selectedTourIndex = selectedTour ? groupedTours.findIndex(({ relatedTours }) => relatedTours.some((tour) => tour.id === selectedTour.id)) : -1;

  const updateControls = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const maximumScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft < maximumScroll - 2);
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
    const element = scrollerRef.current;
    if (!element) return;
    const cardStep = getCardStep(element);
    if (!cardStep) return;
    const currentIndex = Math.round(element.scrollLeft / cardStep);
    const maximumStartIndex = Math.max(0, groupedTours.length - visibleCardCount);
    const targetIndex = direction === 'right'
      ? Math.min(currentIndex + visibleCardCount, maximumStartIndex)
      : Math.max(currentIndex - visibleCardCount, 0);
    scrollToCard(element, targetIndex, 'smooth');
  }

  return (
    <section className="home-section tours-ocean-atmosphere pb-24 pt-0 sm:pb-28 sm:pt-8 lg:pb-36 lg:pt-10" data-home-section data-nav-href="/#tours" id="tours">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between" data-section-anchor>
          <SectionTitle
            align="left"
            eyebrow="Tours"
            title={tr(text.home.toursTitle, language)}
          />
          <div className="flex items-center gap-3 self-end md:self-auto">
            <span className="hidden text-sm font-bold text-ocean-200 sm:inline">{groupedTours.length} {tr(text.home.toursAvailable, language)}</span>
            <div className="flex gap-3 lg:hidden">
              <CarouselButton direction="left" disabled={!canScrollLeft} onClick={() => scrollByCard('left')} />
              <CarouselButton direction="right" disabled={!canScrollRight} onClick={() => scrollByCard('right')} />
            </div>
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

        <div className="relative mt-8 lg:px-12">
          <div className="absolute inset-y-0 left-0 hidden items-center lg:flex">
            <CarouselButton direction="left" disabled={!canScrollLeft} onClick={() => scrollByCard('left')} />
          </div>
          <div
            ref={scrollerRef}
            className={cn(
              'flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-5 sm:gap-6',
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
          <div className="absolute inset-y-0 right-0 hidden items-center lg:flex">
            <CarouselButton direction="right" disabled={!canScrollRight} onClick={() => scrollByCard('right')} />
          </div>
        </div>
      </Container>
    </section>
  );
}

interface CarouselButtonProps {
  direction: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}

function CarouselButton({ direction, disabled, onClick }: CarouselButtonProps) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      className="focus-ring glass-control glass-interactive grid size-10 place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-35"
      type="button"
      aria-label={`Scroll tours ${direction}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={20} />
    </button>
  );
}

function getVisibleCardCount() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}

function getCardStep(element: HTMLDivElement) {
  const firstCard = element.children.item(0) as HTMLElement | null;
  const secondCard = element.children.item(1) as HTMLElement | null;
  if (!firstCard) return 0;
  return secondCard ? secondCard.offsetLeft - firstCard.offsetLeft : firstCard.offsetWidth;
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
