import { ShieldCheck } from 'lucide-react';

import { BookingPanel, getBookingTerms } from '../components/booking/BookingPanel';
import { BackToHomeButton } from '../components/common/BackToHomeButton';
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
      <section className="pb-36 pt-20 sm:pt-24 lg:pb-8 lg:pt-24">
        <Container>
          <BackToHomeButton />
          <SectionHeader
            align="left"
            description={tr(text.home.bookingDescription, language)}
            level={1}
            title={tr(text.home.bookingTitle, language)}
            variant="feature"
          />
          <div className="mt-4 lg:mt-5">
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

          {/* Discreet, non-competing reassurance copy — deliberately kept
              outside the booking flow's own cards so it never occupies
              space inside the form/summary. Centered block, centered text. */}
          <div className="mx-auto mt-6 max-w-2xl border-t border-white/10 pt-4 text-center sm:mt-8 sm:pt-5">
            <p className="flex items-center justify-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ocean-400">
              <ShieldCheck aria-hidden="true" size={13} />
              {language === 'es' ? 'Información de la reserva' : 'Booking information'}
            </p>
            <div className="mx-auto mt-2 grid max-w-xl gap-1 text-xs leading-5 text-ocean-300">
              {getBookingTerms(language).slice(0, 3).map((term) => (
                <p key={term}>{term}</p>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
