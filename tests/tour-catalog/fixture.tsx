import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingSelectionProvider } from '../../src/contexts/BookingSelectionContext';
import { useBookingCatalog } from '../../src/hooks/useBookingCatalog';
import { TourCarouselSection } from '../../src/components/home/TourCarouselSection';
import { BookingPanel } from '../../src/components/booking/BookingPanel';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import '../../src/index.css';
function Fixture() {
  const catalog = useBookingCatalog();
  const [booking, setBooking] = useState(false);
  if (catalog.catalogLoading || !catalog.selectedBoat) return <p>Loading</p>;
  return <main className="bg-ocean-950 text-white">
    <TourCarouselSection boats={catalog.catalogBoats} tours={catalog.toursWithKnownBoats} selectedTour={catalog.selectedTour}
      onSelectTour={(item) => { catalog.selectBoatAndTour(item); setBooking(true); }} />
    <output data-testid="selection">{JSON.stringify({boatId: catalog.selectedBoat.id, tourId: catalog.selectedTour?.tourId,
      boatTourId: catalog.selectedTour?.boatTourId, packageId: catalog.selectedTour?.id})}</output>
    {booking ? <BookingPanel selectedBoat={catalog.selectedBoat} selectedTour={catalog.selectedTour} boats={catalog.catalogBoats}
      tours={catalog.catalogTours} onBoatChange={catalog.changeBoat} onTourChange={(item) => { if (item) catalog.selectBoatAndTour(item); }} /> : null}
  </main>;
}
createRoot(document.getElementById('fixture-root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LanguageProvider><MemoryRouter><BookingSelectionProvider><Fixture /></BookingSelectionProvider></MemoryRouter></LanguageProvider></QueryClientProvider>);
