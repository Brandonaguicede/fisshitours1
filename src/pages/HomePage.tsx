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
      <section className="home-section section-y relative overflow-hidden bg-ocean-950" data-home-section data-nav-href="/#booking" id="booking">
        <SectionReveal><Container className="relative">
          <div data-nav-frame>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" {...reveal(0)}>
              <SectionHeader align="left" description={tr(text.home.bookingDescription, language)} title={tr(text.home.bookingTitle, language)} />
            </div>
            <div className="mx-auto mt-6 sm:mt-7">
              <BookingTeaser selectedBoat={selectedBoat} selectedTour={selectedTour} tours={catalogTours} />
            </div>
          </div>
        </Container></SectionReveal>
      </section>
      <SectionReveal variant="atmosphere"><Testimonials /></SectionReveal>
      <SectionReveal variant="mask"><GallerySection /></SectionReveal>
      {/* `.section-reveal--visible` leaves `transform: translate3d(0,0,0)`
          on this wrapper — a no-op visually, but any non-`none` transform
          still creates a stacking context, which traps the Contact CTA's
          own z-index below it (so it can never outrank Footer, no matter
          how high). Overriding just that transform back to `none` once
          settled removes the trap without touching the entrance animation
          itself (it only affects the resting state) or elevating the rest
          of About above Footer — only the CTA's own z-30 does that now. */}
      <SectionReveal className="[&.section-reveal--visible]:!transform-none"><AboutPreview /></SectionReveal>
    </>
  );
}
