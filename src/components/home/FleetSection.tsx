import { ChevronLeft, ChevronRight, Gauge, Ruler, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getBoatText, getTourGroupKey, getTourText } from '../../i18n/content';
import type { Language } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { BoatCard } from '../boats/BoatCard';
import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { Modal } from '../common/Modal';
import { SectionTitle } from '../common/SectionTitle';

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
  const [galleryPage, setGalleryPage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const modalBoatText = modalBoat ? getBoatText(modalBoat, language) : null;
  const modalTourTypes = getModalTourTypes(modalBoat, tours, language);
  const modalImages = getBoatImages(modalBoat);
  const galleryPageSize = useGalleryPageSize();
  const galleryPageCount = Math.max(1, Math.ceil(modalImages.length / galleryPageSize));
  const visibleImageStart = galleryPage * galleryPageSize;
  const visibleImages = modalImages.slice(visibleImageStart, visibleImageStart + galleryPageSize);

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

  useEffect(() => {
    if (!modalBoat) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setGalleryPage((page) => Math.min(page + 1, galleryPageCount - 1));
      if (event.key === 'ArrowLeft') setGalleryPage((page) => Math.max(page - 1, 0));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [galleryPageCount, modalBoat]);

  useEffect(() => {
    setGalleryPage((page) => Math.min(page, galleryPageCount - 1));
  }, [galleryPageCount]);

  function openBoatDetails(boat: Boat) {
    onSelectBoat(boat);
    setGalleryPage(0);
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
    <section className="section-y scroll-mt-24" data-after-hero="true" id="fleet">
      <Container>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle
            align="left"
            eyebrow={tr(text.home.fleetEyebrow, language)}
            title={tr(text.home.fleetTitle, language)}
            description={tr(text.home.fleetDescription, language)}
          />
          <div className="flex shrink-0 gap-3" aria-label={language === 'es' ? 'Controles del carrusel de barcos' : 'Boat carousel controls'}>
            <CarouselButton
              direction="previous"
              disabled={!canScrollLeft}
              label={language === 'es' ? 'Barcos anteriores' : 'Previous boats'}
              onClick={() => scrollBoats(-1)}
            />
            <CarouselButton
              direction="next"
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

      <Modal open={Boolean(modalBoat)} onClose={closeBoatDetails} titleId="boat-detail-title" className="glass-surface !max-h-[calc(100dvh-1.5rem)] !max-w-5xl text-white sm:!max-h-[85dvh] sm:rounded-[2rem]">
        {modalBoat ? (
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="relative isolate overflow-hidden bg-ocean-900/45 p-3 sm:p-4">
              <div className="flex justify-center pb-2.5">
                <span className="glass-control rounded-full px-3 py-1 text-xs font-semibold text-white/85">
                  {formatGalleryProgress(galleryPage, galleryPageSize, modalImages.length)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleImages.map((image, index) => (
                  <div key={image} className="h-48 overflow-hidden rounded-2xl border border-white/10 bg-ocean-900/60 shadow-[0_10px_28px_rgba(0,0,0,0.16)] sm:h-52">
                    {!failedImages.has(image) ? (
                      <img
                        className="h-full w-full object-cover transition-opacity duration-300"
                        src={image}
                        alt={`${modalBoat.name} ${visibleImageStart + index + 1}`}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        onError={() => setFailedImages((current) => new Set(current).add(image))}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-sm font-semibold text-ocean-200">
                        {language === 'es' ? 'Imagen no disponible' : 'Image unavailable'}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                className="focus-ring glass-control glass-interactive absolute right-4 top-4 z-20 grid size-8 place-items-center rounded-full text-white"
                type="button"
                aria-label={language === 'es' ? 'Cerrar detalles del barco' : 'Close boat details'}
                onClick={closeBoatDetails}
              >
                <X size={15} />
              </button>

              {galleryPageCount > 1 ? (
                <div className="flex items-center justify-center gap-2 pt-2.5">
                  <GalleryButton
                    direction="previous"
                    disabled={galleryPage === 0}
                    label={language === 'es' ? 'Imagen anterior' : 'Previous image'}
                    onClick={() => setGalleryPage((page) => Math.max(page - 1, 0))}
                  />
                  <GalleryButton
                    direction="next"
                    disabled={galleryPage === galleryPageCount - 1}
                    label={language === 'es' ? 'Imagen siguiente' : 'Next image'}
                    onClick={() => setGalleryPage((page) => Math.min(page + 1, galleryPageCount - 1))}
                  />
                </div>
              ) : null}
            </div>

            <div className="p-5 sm:p-6 lg:p-7">
              <div>
                <h3 id="boat-detail-title" className="font-display text-3xl font-semibold leading-none text-white sm:text-4xl">{modalBoat.name}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-ocean-300">
                  {modalBoatText?.badge ?? (language === 'es' ? 'Charter privado' : 'Private charter')}
                </p>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:gap-6">
                <aside className="glass-surface rounded-[1.5rem] p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Detalles del barco' : 'Boat details'}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <CompactSpec icon={<Ruler size={16} />} label={language === 'es' ? 'Tamaño' : 'Size'} value={modalBoatText?.length ?? modalBoat.length} />
                    <CompactSpec icon={<Gauge size={16} />} label={language === 'es' ? 'Motor' : 'Engine'} value={modalBoat.engine} />
                    <CompactSpec icon={<Users size={16} />} label={language === 'es' ? 'Capacidad máxima' : 'Maximum capacity'} value={String(modalBoat.maxGuests)} />
                    <CompactSpec icon={<Users size={16} />} label={language === 'es' ? 'Incluidos' : 'Guests included'} value={String(modalBoat.includedGuests)} />
                  </div>
                  <div className="glass-control mt-3 min-h-14 rounded-2xl px-4 sm:px-5">
                    <DetailLine label={language === 'es' ? 'Persona extra' : 'Additional guest'} value={`${formatCurrency(modalBoat.extraGuestPrice)} ${language === 'es' ? 'cada una' : 'each'}`} />
                  </div>
                  <div className="glass-control mt-4 rounded-2xl p-3.5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ocean-400">{language === 'es' ? 'Equipamiento' : 'Equipment'}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {getEquipmentItems(modalBoatText?.featuredSpec ?? modalBoat.featuredSpec).map((item) => (
                        <span key={item} className="glass-control rounded-full px-2.5 py-1 text-xs font-medium text-ocean-100">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </aside>

                <div className="glass-surface rounded-[1.5rem] p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Tipos de tour' : 'Tour types'}</p>
                  <h4 className="mt-1.5 font-display text-xl font-semibold leading-tight text-white sm:text-2xl">{language === 'es' ? 'Elige la experiencia que quieres explorar' : 'Choose the experience you want to explore'}</h4>
                  <div className="mt-4 grid gap-2.5">
                    {modalTourTypes.map((tour) => (
                      <button
                        key={tour.key}
                        className="focus-ring glass-control glass-interactive group flex min-w-0 items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left"
                        type="button"
                        onClick={() => handleViewTourType(tour.representativeTour)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-display text-lg font-semibold leading-tight text-white">{tour.title}</span>
                          <span className="mt-1 block text-xs font-medium text-ocean-200">
                            {language === 'es' ? 'Desde' : 'From'} {formatCurrency(tour.price)} · {tour.category}
                          </span>
                        </span>
                        <span className={`${modalArrowClassName} transition-transform duration-200 group-hover:translate-x-0.5`} aria-hidden="true">
                          <ChevronRight size={modalArrowIconSize} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <Button variant="secondary" className="glass-primary mt-4 min-h-10 w-full py-2 text-ocean-950" type="button" onClick={handleViewAllTours}>
                    {language === 'es' ? 'Ver todos los tours' : 'View All Tours'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

function CarouselButton({ direction, disabled, label, onClick }: { direction: 'previous' | 'next'; disabled: boolean; label: string; onClick: () => void }) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      className="focus-ring glass-control glass-interactive grid size-10 place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-35"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={20} />
    </button>
  );
}

function GalleryButton({ direction, disabled, label, onClick }: { direction: 'previous' | 'next'; disabled: boolean; label: string; onClick: () => void }) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      className={`focus-ring glass-interactive ${modalArrowClassName} disabled:cursor-not-allowed disabled:opacity-35`}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={modalArrowIconSize} />
    </button>
  );
}

function CompactSpec({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="glass-control flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5">
      <span className="shrink-0 text-ocean-400" aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-medium text-ocean-300">{label}</span>
        <span className="block truncate text-xs font-semibold text-white sm:text-sm">{value}</span>
      </span>
    </div>
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

const modalArrowClassName = 'glass-control grid size-9 shrink-0 place-items-center rounded-full text-white';
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

function useGalleryPageSize() {
  const [pageSize, setPageSize] = useState(() => getGalleryPageSize());

  useEffect(() => {
    const updatePageSize = () => setPageSize(getGalleryPageSize());
    window.addEventListener('resize', updatePageSize);
    return () => window.removeEventListener('resize', updatePageSize);
  }, []);

  return pageSize;
}

function getGalleryPageSize() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}

function formatGalleryProgress(page: number, pageSize: number, total: number) {
  return `${Math.min((page + 1) * pageSize, total)} / ${total}`;
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
