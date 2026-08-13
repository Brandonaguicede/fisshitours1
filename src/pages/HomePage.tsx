import { useMemo, useRef, useState } from 'react';

import { BookingPanel } from '../components/booking/BookingPanel';
import { Container } from '../components/common/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { AboutPreview } from '../components/home/AboutPreview';
import { FleetSection } from '../components/home/FleetSection';
import { GallerySection } from '../components/home/GallerySection';
import { Hero } from '../components/home/Hero';
import { TourCarouselSection } from '../components/home/TourCarouselSection';
import { boatTours } from '../data/boatTours';
import { boats } from '../data/boats';
import { useLanguage } from '../i18n/LanguageContext';
import { text, tr } from '../i18n/translations';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

export default function HomePage() {
  const { language } = useLanguage();
  const [selectedBoat, setSelectedBoat] = useState<Boat>(boats[0]);
  const [selectedTour, setSelectedTour] = useState<BoatTour | undefined>(boatTours.find((tour) => tour.boatId === boats[0].id));
  const toursRef = useRef<HTMLDivElement | null>(null);
  const bookingRef = useRef<HTMLDivElement | null>(null);

  const toursWithKnownBoats = useMemo(() => boatTours.filter((tour) => boats.some((boat) => boat.id === tour.boatId)), []);

  function selectBoat(boat: Boat, shouldScrollToTours = true) {
    setSelectedBoat(boat);
    setSelectedTour(boatTours.find((tour) => tour.boatId === boat.id));
    if (shouldScrollToTours) {
      window.setTimeout(() => toursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }

  function selectTour(tour: BoatTour) {
    const tourBoat = boats.find((boat) => boat.id === tour.boatId);
    if (tourBoat) {
      setSelectedBoat(tourBoat);
    }
    setSelectedTour(tour);
    window.setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function changeBoatFromBooking(boat: Boat) {
    setSelectedBoat(boat);
    setSelectedTour(undefined);
  }

  return (
    <>
      <Hero />
      <FleetSection boats={boats} selectedBoat={selectedBoat} onSelectBoat={selectBoat} onSelectTour={selectTour} />
      <div ref={toursRef}>
        <TourCarouselSection boats={boats} tours={toursWithKnownBoats} selectedTour={selectedTour} onSelectTour={selectTour} />
      </div>
      <section className="section-y scroll-mt-24 bg-ocean-950" id="booking" ref={bookingRef}>
        <Container>
          <SectionTitle
            align="left"
            eyebrow={tr(text.home.bookingEyebrow, language)}
            title={tr(text.home.bookingTitle, language)}
            description={tr(text.home.bookingDescription, language)}
          />
          <div className="mt-10">
            <BookingPanel selectedBoat={selectedBoat} selectedTour={selectedTour} onBoatChange={changeBoatFromBooking} onTourChange={setSelectedTour} />
          </div>
        </Container>
      </section>
      <GallerySection />
      <AboutPreview />
    </>
  );
}
