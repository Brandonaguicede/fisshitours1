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
}

export function FleetSection({ boats, tours, selectedBoat, onSelectBoat, onViewTourType }: FleetSectionProps) {
  const { language } = useLanguage();
  const [modalBoat, setModalBoat] = useState<Boat | null>(null);
  const [galleryPage, setGalleryPage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [selectedTourKey, setSelectedTourKey] = useState<string | null>(null);
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
  const selectedTour = modalTourTypes.find((tour) => tour.key === selectedTourKey) ?? modalTourTypes[0];

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
    setSelectedTourKey(getModalTourTypes(boat, tours, language)[0]?.key ?? null);
    setModalBoat(boat);
  }

  function scrollBoats(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction * Math.max(carousel.clientWidth * 0.82, 300), behavior: 'smooth' });
  }

  function handleViewTourType(tour: BoatTour) {
    onViewTourType(tour);
    closeBoatDetails();
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
            <BoatCard key={boat.id} boat={boat} isSelected={boat.id === selectedBoat.id} onSelect={openBoatDetails} />
          ))}
        </div>
      </Container>

      <Modal open={Boolean(modalBoat)} onClose={closeBoatDetails} titleId="boat-detail-title" className="!max-h-[calc(100dvh-1.5rem)] !max-w-5xl border border-white/10 !bg-ocean-950/90 text-white shadow-[0_24px_72px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:!max-h-[85dvh] sm:rounded-[2rem]">
        {modalBoat ? (
          <div className="overflow-y-auto overscroll-contain">
            <div className="relative isolate overflow-hidden bg-ocean-900/45 p-3 sm:p-4">
              <div className="flex justify-center pb-2.5">
                <span className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-md">
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
                className="focus-ring absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full border border-white/15 bg-slate-950/35 text-white shadow-soft backdrop-blur-md transition duration-200 hover:border-white/25 hover:bg-white/15 sm:right-4 sm:top-4"
                type="button"
                aria-label={language === 'es' ? 'Cerrar detalles del barco' : 'Close boat details'}
                onClick={closeBoatDetails}
              >
                <X size={20} />
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

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <CompactSpec icon={<Users size={16} />} label={language === 'es' ? 'Capacidad' : 'Capacity'} value={`${language === 'es' ? 'Máx.' : 'Max'} ${modalBoat.maxGuests}`} />
                <CompactSpec icon={<Ruler size={16} />} label={language === 'es' ? 'Tamaño' : 'Size'} value={modalBoatText?.length ?? modalBoat.length} />
                <CompactSpec icon={<Gauge size={16} />} label={language === 'es' ? 'Motor' : 'Motor'} value={modalBoat.engine} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:gap-6">
                <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_12px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Detalles del barco' : 'Boat details'}</p>
                  <div className="mt-3 divide-y divide-white/10 text-sm">
                    <DetailLine label={language === 'es' ? 'Pasajeros incluidos' : 'Guests included'} value={String(modalBoat.includedGuests)} />
                    <DetailLine label={language === 'es' ? 'Persona extra' : 'Additional guest'} value={`${formatCurrency(modalBoat.extraGuestPrice)} ${language === 'es' ? 'cada una' : 'each'}`} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-ocean-900/25 p-3.5 backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ocean-400">{language === 'es' ? 'Equipamiento' : 'Equipment'}</p>
                    <p className="mt-2 text-sm font-medium leading-5 text-ocean-100">{modalBoatText?.featuredSpec ?? modalBoat.featuredSpec}</p>
                  </div>
                </aside>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_12px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Tipos de tour' : 'Tour types'}</p>
                  <h4 className="mt-1.5 font-display text-xl font-semibold leading-tight text-white sm:text-2xl">{language === 'es' ? 'Elige la experiencia que quieres explorar' : 'Choose the experience you want to explore'}</h4>
                  <div className="mt-4 grid gap-2.5">
                  {modalTourTypes.map((tour) => {
                    const isTourSelected = tour.key === selectedTour?.key;
                    return (
                      <button
                        key={tour.key}
                        className={`focus-ring group flex min-w-0 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left backdrop-blur-xl transition duration-200 hover:border-ocean-200/45 hover:bg-white/[0.075] ${
                          isTourSelected
                            ? 'border-ocean-200/80 bg-white/[0.1] shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
                            : 'border-white/10 bg-ocean-900/25'
                        }`}
                        type="button"
                        aria-pressed={isTourSelected}
                        onClick={() => setSelectedTourKey(tour.key)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-display text-lg font-semibold leading-tight text-white">{tour.title}</span>
                          <span className="mt-1 block text-xs font-medium text-ocean-200">
                            {language === 'es' ? 'Desde' : 'From'} {formatCurrency(tour.price)} · {tour.category}
                          </span>
                        </span>
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${isTourSelected ? 'border-white bg-white shadow-md' : 'border-white/35 bg-transparent'}`} aria-hidden="true">
                          <span className={`size-2 rounded-full bg-ocean-800 transition ${isTourSelected ? 'scale-100' : 'scale-0'}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                  <Button className="mt-4 min-h-10 w-full py-2" type="button" disabled={!selectedTour} onClick={() => selectedTour && handleViewTourType(selectedTour.representativeTour)}>
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
      className="focus-ring grid size-10 place-items-center rounded-full border border-white/15 bg-ocean-950/30 text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
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
      className="focus-ring grid size-9 place-items-center rounded-full border border-white/10 bg-slate-950/35 text-white shadow-soft backdrop-blur-md transition duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={17} />
    </button>
  );
}

function CompactSpec({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 backdrop-blur-xl">
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
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-ocean-200">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

function getBoatImages(boat: Boat | null) {
  if (!boat) return [];
  const images = boat.images?.length ? boat.images : [boat.image];
  return Array.from(new Set(images.filter(Boolean)));
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

  return Array.from(groups.entries()).map(([key, relatedTours]) => {
    const sortedTours = [...relatedTours].sort((a, b) => a.basePrice - b.basePrice);
    const display = getTourText(sortedTours[0], language);
    return {
      key,
      title: display.title,
      category: display.category,
      price: sortedTours[0].basePrice,
      representativeTour: sortedTours[0],
    };
  });
}
