import { Check, ChevronRight, Gauge, Ruler, ShieldCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getBoatText, getTourGroupKey, getTourText } from '../../i18n/content';
import type { Language } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { BoatCard } from '../boats/BoatCard';
import { Container } from '../common/Container';
import { Button, CarouselArrow, ChoiceCard, CloseButton, GlassPanel, MediaGallery, ModalShell, SectionHeader } from '../ui';

interface FleetSectionProps {
  boats: Boat[];
  tours: BoatTour[];
  selectedBoat: Boat;
  onSelectBoat: (boat: Boat) => void;
  onViewTourType: (tour: BoatTour) => void;
  onViewAllTours: () => void;
}

export function FleetSection({ boats, tours, selectedBoat, onSelectBoat, onViewTourType, onViewAllTours }: FleetSectionProps) {
  const { language } = useLanguage();
  const [modalBoat, setModalBoat] = useState<Boat | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const modalBoatText = modalBoat ? getBoatText(modalBoat, language) : null;
  const modalTourTypes = getModalTourTypes(modalBoat, tours, language);
  const modalImages = getBoatImages(modalBoat);

  const closeBoatDetails = useCallback(() => setModalBoat(null), []);

  const updateCarouselControls = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    setCanScrollLeft(carousel.scrollLeft > 2);
    setCanScrollRight(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    updateCarouselControls();
    const observer = new ResizeObserver(updateCarouselControls);
    observer.observe(carousel);
    return () => observer.disconnect();
  }, [boats, updateCarouselControls]);

  function openBoatDetails(boat: Boat) {
    onSelectBoat(boat);
    setModalBoat(boat);
  }

  function scrollBoats(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction * Math.max(carousel.clientWidth * 0.82, 300), behavior: 'smooth' });
  }

  function handleViewTourType(tour: BoatTour) {
    closeBoatDetails();
    window.setTimeout(() => onViewTourType(tour), 0);
  }

  function handleViewAllTours() {
    closeBoatDetails();
    window.setTimeout(onViewAllTours, 0);
  }

  return (
    <section className="home-section pb-16 pt-0 sm:pb-20 sm:pt-8 lg:pb-24 lg:pt-10" data-after-hero="true" data-home-section data-nav-href="/#fleet" id="fleet">
      <Container>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" data-section-anchor>
          <SectionHeader
            align="left"
            eyebrow={tr(text.home.fleetEyebrow, language)}
            title={tr(text.home.fleetTitle, language)}
            description={tr(text.home.fleetDescription, language)}
          />
          <div className="flex shrink-0 gap-3" aria-label={language === 'es' ? 'Controles del carrusel de barcos' : 'Boat carousel controls'}>
            <CarouselArrow
              direction="left"
              disabled={!canScrollLeft}
              label={language === 'es' ? 'Barcos anteriores' : 'Previous boats'}
              onClick={() => scrollBoats(-1)}
            />
            <CarouselArrow
              direction="right"
              disabled={!canScrollRight}
              label={language === 'es' ? 'Más barcos' : 'Next boats'}
              onClick={() => scrollBoats(1)}
            />
          </div>
        </div>

        <div
          ref={carouselRef}
          className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-5 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6"
          role="region"
          aria-label={language === 'es' ? 'Barcos disponibles' : 'Available boats'}
          onScroll={updateCarouselControls}
        >
          {boats.map((boat) => (
            <BoatCard key={boat.id} boat={boat} startingPrice={getBoatStartingPrice(boat.id, tours)} isSelected={boat.id === selectedBoat.id} onSelect={openBoatDetails} />
          ))}
        </div>
      </Container>

      <ModalShell open={Boolean(modalBoat)} onClose={closeBoatDetails} titleId="boat-detail-title" className="!max-h-[calc(100dvh-1.5rem)] !max-w-5xl text-white sm:!max-h-[85dvh]">
        {modalBoat ? (
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="relative">
              <MediaGallery
                images={modalImages.map((src, index) => ({ alt: `${modalBoat.name} ${index + 1}`, src }))}
                label={language === 'es' ? `Galería de ${modalBoat.name}` : `${modalBoat.name} gallery`}
                nextLabel={language === 'es' ? 'Imagen siguiente' : 'Next image'}
                previousLabel={language === 'es' ? 'Imagen anterior' : 'Previous image'}
                unavailableLabel={language === 'es' ? 'Imagen no disponible' : 'Image unavailable'}
              />
              <CloseButton
                className="absolute right-4 top-4 z-20"
                label={language === 'es' ? 'Cerrar detalles del barco' : 'Close boat details'}
                onClick={closeBoatDetails}
              />
            </div>

            <div className="p-5 sm:p-6 lg:p-7">
              <div>
                <h3 id="boat-detail-title" className="font-display text-3xl font-semibold leading-none text-white sm:text-4xl">{modalBoat.name}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-ocean-300">
                  {modalBoatText?.badge ?? (language === 'es' ? 'Charter privado' : 'Private charter')}
                </p>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:gap-6">
                <GlassPanel as="aside" className="p-4 sm:p-5" variant="surface">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Detalles del barco' : 'Boat details'}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <CompactSpec icon={<Ruler size={16} />} label={language === 'es' ? 'Tamaño' : 'Size'} value={modalBoatText?.length ?? modalBoat.length} />
                    <CompactSpec icon={<Gauge size={16} />} label={language === 'es' ? 'Motor' : 'Engine'} value={modalBoat.engine} />
                    <CompactSpec icon={<Users size={16} />} label={language === 'es' ? 'Capacidad máxima' : 'Maximum capacity'} value={String(modalBoat.maxGuests)} />
                    <CompactSpec icon={<Users size={16} />} label={language === 'es' ? 'Incluidos' : 'Guests included'} value={String(modalBoat.includedGuests)} />
                  </div>
                  <GlassPanel className="mt-3 min-h-14 px-4 sm:px-5" variant="control">
                    <DetailLine label={language === 'es' ? 'Persona extra' : 'Additional guest'} value={`${formatCurrency(modalBoat.extraGuestPrice)} ${language === 'es' ? 'cada una' : 'each'}`} />
                  </GlassPanel>
                  <GlassPanel className="mt-4 overflow-hidden p-0" variant="control">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ocean-300/12 text-ocean-300" aria-hidden="true">
                        <ShieldCheck size={16} />
                      </span>
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ocean-400">{language === 'es' ? 'Equipamiento' : 'Equipment'}</p>
                        <p className="mt-0.5 text-xs font-medium text-ocean-200">{language === 'es' ? 'A bordo para cada salida' : 'On board for every trip'}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
                      {getEquipmentItems(modalBoatText?.featuredSpec ?? modalBoat.featuredSpec).map((item) => (
                        <span className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white" key={item}>
                          <Check className="size-3.5 shrink-0 text-seafoam-400" aria-hidden="true" />
                          <span className="min-w-0 leading-snug">{item}</span>
                        </span>
                      ))}
                    </div>
                  </GlassPanel>
                </GlassPanel>

                <GlassPanel className="p-4 sm:p-5" variant="surface">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Tipos de tour' : 'Tour types'}</p>
                  <h4 className="mt-1.5 font-display text-xl font-semibold leading-tight text-white sm:text-2xl">{language === 'es' ? 'Elige la experiencia que quieres explorar' : 'Choose the experience you want to explore'}</h4>
                  <div className="mt-4 grid gap-2.5">
                    {modalTourTypes.map((tour) => (
                      <ChoiceCard
                        key={tour.key}
                        className="group flex w-full min-w-0 items-center justify-between gap-4 px-4 py-3 text-left"
                        shape="soft"
                        onClick={() => handleViewTourType(tour.representativeTour)}
                      >
                        <span className="min-w-0">
                          <h5 className="block truncate font-display text-lg font-semibold leading-tight text-white">{tour.title}</h5>
                          <span className="mt-1 block text-xs font-medium text-ocean-200">
                            {language === 'es' ? 'Desde' : 'From'} {formatCurrency(tour.price)} · {tour.category}
                          </span>
                        </span>
                        <GlassPanel as="span" className="grid size-9 shrink-0 place-items-center text-white transition-transform duration-200 group-hover:translate-x-0.5" shape="circle" variant="control" aria-hidden="true">
                          <ChevronRight size={modalArrowIconSize} />
                        </GlassPanel>
                      </ChoiceCard>
                    ))}
                  </div>
                  <Button className="mt-4" fullWidth size="sm" type="button" onClick={handleViewAllTours}>
                    {language === 'es' ? 'Ver todos los tours' : 'View All Tours'}
                  </Button>
                </GlassPanel>
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </section>
  );
}

function CompactSpec({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <GlassPanel className="flex min-w-0 items-center gap-2.5 px-3 py-2.5" variant="control">
      <span className="shrink-0 text-ocean-400" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-medium text-ocean-300">{label}</span>
        <span className="block truncate text-xs font-semibold text-white sm:text-sm">{value}</span>
      </span>
    </GlassPanel>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-5 py-3">
      <span className="text-ocean-200">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

const modalArrowIconSize = 17;

function getBoatImages(boat: Boat | null) {
  if (!boat) return [];
  const images = boat.images?.length ? boat.images : [boat.image];
  return Array.from(new Set(images.filter(Boolean)));
}

function getBoatStartingPrice(boatId: string, tours: BoatTour[]) {
  const prices = tours.filter((tour) => tour.boatId === boatId).map((tour) => tour.basePrice);
  return prices.length ? Math.min(...prices) : 0;
}

function getEquipmentItems(equipment: string) {
  return equipment
    .split(',')
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function getModalTourTypes(boat: Boat | null, tours: BoatTour[], language: Language) {
  if (!boat) return [];

  const groups = new Map<string, BoatTour[]>();
  tours
    .filter((tour) => tour.boatId === boat.id)
    .forEach((tour) => {
      const key = getTourGroupKey(tour);
      groups.set(key, [...(groups.get(key) ?? []), tour]);
    });

  return Array.from(groups.entries())
    .map(([key, relatedTours], order) => {
      const sortedTours = [...relatedTours].sort((a, b) => a.basePrice - b.basePrice);
      const display = getTourText(sortedTours[0], language);
      return {
        key,
        title: display.title,
        category: display.category,
        price: sortedTours[0].basePrice,
        representativeTour: sortedTours[0],
        order,
      };
    })
    .sort((a, b) => a.price - b.price || a.order - b.order);
}
