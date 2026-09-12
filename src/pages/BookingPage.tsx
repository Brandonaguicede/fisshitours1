import { BookingPanel } from '../components/booking/BookingPanel';
import { Container } from '../components/common/Container';
import { SectionHeader } from '../components/ui';
import { useBookingCatalog } from '../hooks/useBookingCatalog';
import { useLanguage } from '../i18n/LanguageContext';
import { text, tr } from '../i18n/translations';

export default function BookingPage() {
  const { language } = useLanguage();
  const { catalogBoats, catalogTours, catalogLoading, selectedBoat, selectedTour, changeBoat, changeTour } = useBookingCatalog();

  if (!selectedBoat) return null;

  return (
    <main className="tours-ocean-atmosphere text-white">
      <section className="pb-12 pt-24 sm:pt-28 lg:pt-32">
        <Container>
          <SectionHeader
            align="left"
            description={tr(text.home.bookingDescription, language)}
            eyebrow={tr(text.home.bookingEyebrow, language)}
            level={1}
            title={tr(text.home.bookingTitle, language)}
            variant="feature"
          />
          <div className="mt-6 lg:mt-7">
            <BookingPanel
              boats={catalogBoats}
              catalogLoading={catalogLoading}
              onBoatChange={changeBoat}
              onTourChange={changeTour}
              selectedBoat={selectedBoat}
              selectedTour={selectedTour}
              tours={catalogTours}
            />
          </div>
        </Container>
      </section>
    </main>
  );
}
