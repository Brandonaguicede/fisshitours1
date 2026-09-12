import { useNavigate } from 'react-router-dom';

import { Container } from '../components/common/Container';
import { reveal, SectionReveal } from '../components/common/SectionReveal';
import { SectionHeader } from '../components/ui';
import { AboutPreview } from '../components/home/AboutPreview';
import { BookingTeaser } from '../components/home/BookingTeaser';
import { FleetSection } from '../components/home/FleetSection';
import { GallerySection } from '../components/home/GallerySection';
import { Hero } from '../components/home/Hero';
import { Testimonials } from '../components/home/Testimonials';
import { TourCarouselSection } from '../components/home/TourCarouselSection';
import { useBookingCatalog } from '../hooks/useBookingCatalog';
import { useLanguage } from '../i18n/LanguageContext';
import { text, tr } from '../i18n/translations';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';
import { scrollToHomeSection } from '../utils/homeNavigation';

export default function HomePage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { catalogBoats, catalogTours, toursWithKnownBoats, selectedBoat, selectedTour, selectBoat: selectBoatId, selectBoatAndTour } = useBookingCatalog();

  function scrollToTours() {
    scrollToHomeSection('tours');
  }

  function selectBoat(boat: Boat) {
    selectBoatId(boat);
  }

  // The Tours cards' "Reserve" CTA (via TourDetailModal) is a clear intent
  // to book — it goes straight to the dedicated booking flow with the
  // selection preloaded, instead of the Home teaser.
  function selectTour(tour: BoatTour) {
    selectBoatAndTour(tour);
    navigate('/reservar');
  }

  function viewTourOnHome(tour: BoatTour) {
    selectBoatAndTour(tour);
    window.setTimeout(scrollToTours, 80);
  }

  function viewAllToursOnHome() {
    window.setTimeout(scrollToTours, 80);
  }

  if (!selectedBoat) return null;

  return (
    <>
      <Hero />
      <FleetSection boats={catalogBoats} tours={catalogTours} selectedBoat={selectedBoat} onSelectBoat={selectBoat} onViewTourType={viewTourOnHome} onViewAllTours={viewAllToursOnHome} />
      <TourCarouselSection boats={catalogBoats} tours={toursWithKnownBoats} selectedTour={selectedTour} onSelectTour={selectTour} />
      <SectionReveal><section className="home-section booking-ocean-atmosphere relative overflow-hidden py-10 sm:py-12 lg:py-14" data-home-section data-nav-href="/#booking" id="booking">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ocean-300/30 to-transparent" />
        <span aria-hidden="true" className="atmosphere-drift-slow pointer-events-none absolute left-[13%] top-[20%] hidden size-2 rounded-full bg-ocean-200/30 blur-[1.5px] lg:block" />
        <span aria-hidden="true" className="atmosphere-drift pointer-events-none absolute right-[15%] top-[64%] hidden size-1.5 rounded-full bg-seafoam-300/25 blur-[1px] lg:block" />
        <span aria-hidden="true" className="atmosphere-drift-slow pointer-events-none absolute left-[24%] bottom-[16%] hidden size-3 rounded-full bg-ocean-300/[0.12] blur-[3px] lg:block" />
        <Container className="relative">
          <div data-nav-frame>
            <div className="mx-auto max-w-2xl text-center" {...reveal(0)}>
              <SectionHeader
                align="center"
                description={tr(text.home.bookingDescription, language)}
                eyebrow={tr(text.home.bookingEyebrow, language)}
                title={tr(text.home.bookingTitle, language)}
                variant="compact"
              />
            </div>
            <div className="mx-auto mt-6 sm:mt-7">
              <BookingTeaser selectedBoat={selectedBoat} selectedTour={selectedTour} tours={catalogTours} />
            </div>
          </div>
        </Container>
      </section></SectionReveal>
      <SectionReveal variant="atmosphere"><Testimonials /></SectionReveal>
      <SectionReveal variant="mask"><GallerySection /></SectionReveal>
      <SectionReveal><AboutPreview /></SectionReveal>
    </>
  );
}
