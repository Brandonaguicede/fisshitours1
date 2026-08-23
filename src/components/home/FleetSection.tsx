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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [selectedTourKey, setSelectedTourKey] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const modalBoatText = modalBoat ? getBoatText(modalBoat, language) : null;
  const modalTourTypes = getModalTourTypes(modalBoat, tours, language);
  const modalImages = getBoatImages(modalBoat);
  const activeImage = modalImages[activeImageIndex] ?? modalBoat?.image;
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
      if (event.key === 'ArrowRight') setActiveImageIndex((index) => nextBoatImageIndex(modalBoat, index, 1));
      if (event.key === 'ArrowLeft') setActiveImageIndex((index) => nextBoatImageIndex(modalBoat, index, -1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalBoat]);

  function openBoatDetails(boat: Boat) {
    onSelectBoat(boat);
    setActiveImageIndex(0);
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

      <Modal open={Boolean(modalBoat)} onClose={closeBoatDetails} titleId="boat-detail-title" className="max-w-6xl border border-white/10 !bg-ocean-950 text-white shadow-[0_30px_90px_rgba(2,17,30,0.52)] sm:rounded-[2rem]">
        {modalBoat ? (
          <div className="overflow-y-auto overscroll-contain">
            <div className="relative isolate min-h-[15rem] overflow-hidden bg-ocean-900 sm:min-h-[22rem] lg:min-h-[28rem]">
              {activeImage && !failedImages.has(activeImage) ? (
                <img
                  key={activeImage}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                  src={activeImage}
                  alt={modalBoat.name}
                  loading="eager"
                  decoding="async"
                  onError={() => setFailedImages((current) => new Set(current).add(activeImage))}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-ocean-900 text-sm font-semibold text-ocean-200">
                  {language === 'es' ? 'Imagen no disponible' : 'Image unavailable'}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ocean-950 via-ocean-950/10 to-ocean-950/20" />

              <button
                className="focus-ring absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full border border-white/15 bg-slate-950/35 text-white shadow-soft backdrop-blur-md transition duration-200 hover:bg-white/15 sm:right-5 sm:top-5"
                type="button"
                aria-label={language === 'es' ? 'Cerrar detalles del barco' : 'Close boat details'}
                onClick={closeBoatDetails}
              >
                <X size={20} />
              </button>

              <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/35 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md sm:top-5">
                {activeImageIndex + 1} / {modalImages.length}
              </span>

              {modalImages.length > 1 ? (
                <>
                  <GalleryButton
                    direction="previous"
                    label={language === 'es' ? 'Imagen anterior' : 'Previous image'}
                    onClick={() => setActiveImageIndex((index) => nextBoatImageIndex(modalBoat, index, -1))}
                  />
                  <GalleryButton
                    direction="next"
                    label={language === 'es' ? 'Imagen siguiente' : 'Next image'}
                    onClick={() => setActiveImageIndex((index) => nextBoatImageIndex(modalBoat, index, 1))}
                  />
                </>
              ) : null}

              <div className="absolute inset-x-5 bottom-5 z-10 sm:inset-x-8 sm:bottom-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-200 sm:text-sm">
                  {modalBoatText?.badge ?? (language === 'es' ? 'Charter privado' : 'Private charter')}
                </p>
                <h3 id="boat-detail-title" className="mt-2 font-display text-4xl font-semibold leading-none text-white sm:text-5xl">
                  {modalBoat.name}
                </h3>
              </div>
            </div>

            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.82fr_1.18fr] lg:gap-9 lg:p-9">
              <aside>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Detalles del barco' : 'Boat details'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DetailTile icon={<Ruler size={17} />} label={language === 'es' ? 'Tamaño' : 'Size'} value={modalBoatText?.length ?? modalBoat.length} />
                  <DetailTile icon={<Gauge size={17} />} label={language === 'es' ? 'Motor' : 'Motor'} value={modalBoat.engine} />
                  <DetailTile icon={<Users size={17} />} label={language === 'es' ? 'Capacidad máxima' : 'Maximum capacity'} value={language === 'es' ? `${modalBoat.maxGuests} personas` : `${modalBoat.maxGuests} people`} />
                  <DetailTile icon={<Users size={17} />} label={language === 'es' ? 'Pasajeros incluidos' : 'Guests included'} value={String(modalBoat.includedGuests)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-white/[0.055] px-4 py-3 text-sm text-ocean-200">
                  <span>{language === 'es' ? 'Persona extra' : 'Additional guest'}</span>
                  <span className="font-semibold text-white">{formatCurrency(modalBoat.extraGuestPrice)} {language === 'es' ? 'cada una' : 'each'}</span>
                </div>
                <p className="mt-3 rounded-2xl bg-ocean-500/10 p-4 text-sm font-medium leading-6 text-ocean-100">{modalBoatText?.featuredSpec ?? modalBoat.featuredSpec}</p>
              </aside>

              <div className="rounded-[1.75rem] bg-white/[0.045] p-4 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-400">{language === 'es' ? 'Tipos de tour' : 'Tour types'}</p>
                <h4 className="mt-2 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl">{language === 'es' ? 'Elige la experiencia que quieres explorar' : 'Choose the experience you want to explore'}</h4>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {modalTourTypes.map((tour) => {
                    const isTourSelected = tour.key === selectedTour?.key;
                    return (
                      <button
                        key={tour.key}
                        className={`focus-ring group min-w-0 rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-ocean-300/55 hover:bg-ocean-500/10 ${
                          isTourSelected
                            ? 'border-ocean-300/75 bg-ocean-500/15 shadow-[0_12px_30px_rgba(4,22,38,0.2)]'
                            : 'border-white/10 bg-ocean-900/55'
                        }`}
                        type="button"
                        aria-pressed={isTourSelected}
                        onClick={() => setSelectedTourKey(tour.key)}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold uppercase tracking-[0.12em] text-ocean-400">{tour.category}</span>
                            <span className="mt-2 block font-display text-xl font-semibold leading-tight text-white">{tour.title}</span>
                          </span>
                          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition ${isTourSelected ? 'border-white bg-white' : 'border-white/30 bg-transparent'}`} aria-hidden="true">
                            <span className={`size-2 rounded-full bg-ocean-800 transition ${isTourSelected ? 'scale-100' : 'scale-0'}`} />
                          </span>
                        </span>
                        <span className="mt-4 block w-fit rounded-full bg-white/[0.07] px-3 py-1.5 text-sm font-semibold text-ocean-100">
                          {language === 'es' ? 'Desde' : 'From'} {formatCurrency(tour.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Button className="mt-5 w-full sm:w-auto" type="button" disabled={!selectedTour} onClick={() => selectedTour && handleViewTourType(selectedTour.representativeTour)}>
                  {language === 'es' ? 'Ver todos los tours' : 'View All Tours'}
                </Button>
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
      className="focus-ring grid size-11 place-items-center rounded-full border border-white/15 bg-ocean-950/35 text-white shadow-[0_14px_34px_rgba(0,0,0,0.2)] backdrop-blur-xl transition duration-200 hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={20} />
    </button>
  );
}

function GalleryButton({ direction, label, onClick }: { direction: 'previous' | 'next'; label: string; onClick: () => void }) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      className={`focus-ring absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-slate-950/35 text-white shadow-soft backdrop-blur-md transition duration-200 hover:bg-white/15 sm:size-12 ${direction === 'previous' ? 'left-3 sm:left-5' : 'right-3 sm:right-5'}`}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={21} />
    </button>
  );
}

function DetailTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.055] p-4">
      <span className="text-ocean-400" aria-hidden="true">{icon}</span>
      <span className="mt-3 block text-xs font-medium text-ocean-300">{label}</span>
      <span className="mt-1 block break-words text-sm font-semibold leading-tight text-white">{value}</span>
    </div>
  );
}

function getBoatImages(boat: Boat | null) {
  if (!boat) return [];
  const images = boat.images?.length ? boat.images : [boat.image];
  return Array.from(new Set(images.filter(Boolean)));
}

function nextBoatImageIndex(boat: Boat | null, current: number, direction: -1 | 1) {
  const images = getBoatImages(boat);
  if (images.length <= 1) return 0;
  return (current + direction + images.length) % images.length;
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
