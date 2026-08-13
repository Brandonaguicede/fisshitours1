import { useMemo, useRef, useState } from 'react';

import { BoatCard } from '../components/boats/BoatCard';
import { BookingPanel } from '../components/booking/BookingPanel';
import { Container } from '../components/common/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { BoatTourCard } from '../components/tours/BoatTourCard';
import { boatTours } from '../data/boatTours';
import { boats } from '../data/boats';
import { useLanguage } from '../i18n/LanguageContext';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

export default function ToursPage() {
  const { language } = useLanguage();
  const [selectedBoat, setSelectedBoat] = useState<Boat>(boats[0]);
  const [selectedTour, setSelectedTour] = useState<BoatTour | undefined>(boatTours.find((tour) => tour.boatId === boats[0].id));
  const toursRef = useRef<HTMLElement | null>(null);
  const bookingRef = useRef<HTMLElement | null>(null);

  const availableTours = useMemo(() => boatTours.filter((tour) => tour.boatId === selectedBoat.id), [selectedBoat.id]);

  function selectBoat(boat: Boat) {
    setSelectedBoat(boat);
    setSelectedTour(undefined);
    window.setTimeout(() => toursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function selectTour(tour: BoatTour) {
    setSelectedTour(tour);
    window.setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function changeBoatFromBooking(boat: Boat) {
    setSelectedBoat(boat);
    setSelectedTour(undefined);
  }

  return (
    <>
      <section className="section-y pt-28">
        <Container>
          <div className="rounded-[2rem] bg-ocean-900 px-6 py-12 text-white shadow-lifted sm:px-10">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{language === 'es' ? 'Reserva por flota' : 'Fleet first booking'}</p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-extrabold leading-tight sm:text-6xl">
              {language === 'es' ? 'Elige tu barco, explora sus tours y reserva con capacidad y precio precisos' : 'Choose your boat, explore its tours, reserve with accurate capacity and pricing'}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-ocean-200">
              {language === 'es'
                ? 'Cada barco tiene sus propias reglas de personas, lista de tours, horarios, precio por pasajero extra y capacidad máxima.'
                : 'Each boat has its own guest rules, tour list, time slots, extra passenger pricing and maximum capacity.'}
            </p>
          </div>
        </Container>
      </section>

      <section className="scroll-mt-24 pb-16 sm:pb-20 lg:pb-24" id="fleet">
        <Container>
          <SectionTitle
            align="left"
            eyebrow={language === 'es' ? 'Nuestra flota' : 'Our fleet'}
            title={language === 'es' ? 'Barcos listos para pesca, playa y navegación privada' : 'Boats ready for fishing, beach and private navigation'}
            description={language === 'es'
              ? 'La capacidad mostrada indica las personas incluidas en el precio base. La capacidad máxima se maneja por separado.'
              : 'The displayed capacity is the number of guests included in the base price. Maximum allowed capacity is handled separately.'}
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {boats.map((boat) => (
              <BoatCard key={boat.id} boat={boat} isSelected={boat.id === selectedBoat.id} onSelect={selectBoat} />
            ))}
          </div>
        </Container>
      </section>

      <section className="section-y scroll-mt-24 bg-ocean-900/55" id="tours" ref={toursRef}>
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <SectionTitle
                align="left"
                eyebrow={language === 'es' ? 'Explora tours' : 'Explore Tours'}
                title={language === 'es' ? `Tours a bordo de ${selectedBoat.name}` : `Tours aboard ${selectedBoat.name}`}
                description={language === 'es'
                  ? `Mostrando solo los tours disponibles en ${selectedBoat.name}. Cambia el barco arriba o en la reserva para reiniciar tour y horario.`
                  : `Showing only tours available on ${selectedBoat.name}. Change the boat above or in booking to reset dependent tour and time selections.`}
              />
            </div>
            <div className="glass-card grid gap-4 rounded-2xl p-4 sm:grid-cols-[140px_1fr]">
              <img className="aspect-[4/3] rounded-xl object-cover" src={selectedBoat.image} alt={selectedBoat.name} loading="lazy" />
              <div>
                <p className="text-lg font-extrabold text-white">{selectedBoat.name}</p>
                <p className="mt-1 text-sm text-ocean-200">
                  {language === 'es'
                    ? `Incluye ${selectedBoat.includedGuests} personas, máximo ${selectedBoat.maxGuests}. Persona extra desde $${selectedBoat.extraGuestPrice}.`
                    : `Includes ${selectedBoat.includedGuests} guests, maximum ${selectedBoat.maxGuests}. Extra guest from $${selectedBoat.extraGuestPrice}.`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {availableTours.map((tour) => (
              <BoatTourCard key={tour.id} boat={selectedBoat} tour={tour} isSelected={tour.id === selectedTour?.id} onSelect={selectTour} />
            ))}
          </div>
        </Container>
      </section>

      <section className="section-y scroll-mt-24 bg-ocean-950" id="booking" ref={bookingRef}>
        <Container>
          <SectionTitle
            align="left"
            eyebrow={language === 'es' ? 'Reserva tu experiencia' : 'Reserve Your Experience'}
            title={language === 'es' ? 'La reserva responde al barco, tour, personas y horario que elijas' : 'Booking reacts to the boat, tour, guests and time you choose'}
            description={language === 'es'
              ? 'La validación de capacidad, cargos por persona extra y cotizaciones se calculan desde datos configurables.'
              : 'Capacity validation, extra guest charges and custom quote behavior are calculated from configurable data.'}
          />
          <div className="mt-10">
            <BookingPanel selectedBoat={selectedBoat} selectedTour={selectedTour} onBoatChange={changeBoatFromBooking} onTourChange={setSelectedTour} />
          </div>
        </Container>
      </section>
    </>
  );
}
