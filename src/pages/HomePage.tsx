import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { BookingPanel } from '../components/booking/BookingPanel';
import { Container } from '../components/common/Container';
import { AboutPreview } from '../components/home/AboutPreview';
import { FleetSection } from '../components/home/FleetSection';
import { GallerySection } from '../components/home/GallerySection';
import { Hero } from '../components/home/Hero';
import { Testimonials } from '../components/home/Testimonials';
import { TourCarouselSection } from '../components/home/TourCarouselSection';
import { boatTours } from '../data/boatTours';
import { boats } from '../data/boats';
import { useLanguage } from '../i18n/LanguageContext';
import { text, tr } from '../i18n/translations';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';
import { getActiveBoats } from '../services/boatService';
import { getActiveBoatTours } from '../services/boatTourService';

export default function HomePage() {
  const { language } = useLanguage();
  const boatsQuery = useQuery({ queryKey: ['boats', 'active'], queryFn: getActiveBoats });
  const toursQuery = useQuery({ queryKey: ['boatTours', 'active'], queryFn: getActiveBoatTours });
  const catalogBoats = boatsQuery.data?.length ? boatsQuery.data : boats;
  const catalogTours = toursQuery.data?.length ? toursQuery.data : boatTours;
  const [selectedBoatId, setSelectedBoatId] = useState(boats[0].id);
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>(boatTours.find((tour) => tour.boatId === boats[0].id)?.id);
  const toursRef = useRef<HTMLDivElement | null>(null);
  const bookingRef = useRef<HTMLDivElement | null>(null);

  const selectedBoat = useMemo(() => catalogBoats.find((boat) => boat.id === selectedBoatId) ?? catalogBoats[0], [catalogBoats, selectedBoatId]);
  const selectedTour = useMemo(() => catalogTours.find((tour) => tour.id === selectedTourId && tour.boatId === selectedBoat?.id), [catalogTours, selectedBoat?.id, selectedTourId]);
  const toursWithKnownBoats = useMemo(() => catalogTours.filter((tour) => catalogBoats.some((boat) => boat.id === tour.boatId)), [catalogBoats, catalogTours]);
  const catalogError = boatsQuery.isError || toursQuery.isError;
  const catalogLoading = boatsQuery.isLoading || toursQuery.isLoading;

  function selectBoat(boat: Boat, shouldScrollToTours = true) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(catalogTours.find((tour) => tour.boatId === boat.id)?.id);
    if (shouldScrollToTours) {
      window.setTimeout(() => toursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }

  function selectTour(tour: BoatTour) {
    const tourBoat = catalogBoats.find((boat) => boat.id === tour.boatId);
    if (tourBoat) {
      setSelectedBoatId(tourBoat.id);
    }
    setSelectedTourId(tour.id);
    window.setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function viewTourOnHome(tour: BoatTour) {
    const tourBoat = catalogBoats.find((boat) => boat.id === tour.boatId);
    if (tourBoat) {
      setSelectedBoatId(tourBoat.id);
    }
    setSelectedTourId(tour.id);
    window.setTimeout(() => toursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function changeBoatFromBooking(boat: Boat) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
  }

  function changeTourFromBooking(tour?: BoatTour) {
    setSelectedTourId(tour?.id);
  }

  if (!selectedBoat) return null;

  return (
    <>
      <Hero />
      <FleetSection boats={catalogBoats} tours={catalogTours} selectedBoat={selectedBoat} onSelectBoat={selectBoat} onViewTourType={viewTourOnHome} />
      <div ref={toursRef}>
        <TourCarouselSection boats={catalogBoats} tours={toursWithKnownBoats} selectedTour={selectedTour} onSelectTour={selectTour} />
      </div>
      <section className="scroll-mt-24 bg-ocean-950 py-10 sm:py-14 lg:py-16" id="booking" ref={bookingRef}>
        <Container>
          <div className="mx-auto max-w-4xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean-400">{tr(text.home.bookingEyebrow, language)}</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">{tr(text.home.bookingTitle, language)}</h2>
              <p className="mt-3 text-sm leading-6 text-ocean-200">{tr(text.home.bookingDescription, language)}</p>
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-4xl lg:mt-7">
            {catalogError ? (
              <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-5 text-sm font-semibold text-red-100">We couldn’t load the booking information. Please try again.</div>
            ) : (
              <BookingPanel
                selectedBoat={selectedBoat}
                selectedTour={selectedTour}
                boats={catalogBoats}
                tours={catalogTours}
                catalogLoading={catalogLoading}
                onBoatChange={changeBoatFromBooking}
                onTourChange={changeTourFromBooking}
              />
            )}
          </div>
        </Container>
      </section>
      <GallerySection />
      <AboutPreview />
      <Testimonials />
    </>
  );
}
