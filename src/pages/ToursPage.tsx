import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { BoatCard } from '../components/boats/BoatCard';
import { BookingPanel } from '../components/booking/BookingPanel';
import { Container } from '../components/common/Container';
import { SectionTitle } from '../components/common/SectionTitle';
import { BoatTourCard } from '../components/tours/BoatTourCard';
import { useLanguage } from '../i18n/LanguageContext';
import { getActiveBoats } from '../services/boatService';
import { getActiveBoatTours } from '../services/boatTourService';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

export default function ToursPage() {
  const { language } = useLanguage();
  const boatsQuery = useQuery({ queryKey: ['boats', 'active'], queryFn: getActiveBoats });
  const toursQuery = useQuery({ queryKey: ['boatTours', 'active'], queryFn: getActiveBoatTours });
  const catalogBoats = boatsQuery.data ?? [];
  const catalogTours = toursQuery.data ?? [];
  const [selectedBoatId, setSelectedBoatId] = useState('segundo-viento');
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>();
  const toursRef = useRef<HTMLElement | null>(null);
  const bookingRef = useRef<HTMLElement | null>(null);

  const selectedBoat = useMemo(() => catalogBoats.find((boat) => boat.id === selectedBoatId) ?? catalogBoats[0], [catalogBoats, selectedBoatId]);
  const availableTours = useMemo(() => selectedBoat ? catalogTours.filter((tour) => tour.boatId === selectedBoat.id) : [], [catalogTours, selectedBoat]);
  const selectedTour = useMemo(() => availableTours.find((tour) => tour.id === selectedTourId), [availableTours, selectedTourId]);
  const groupedTours = useMemo(() => groupToursForCards(availableTours), [availableTours]);
  const isLoading = boatsQuery.isLoading || toursQuery.isLoading;
  const isError = boatsQuery.isError || toursQuery.isError;

  function selectBoat(boat: Boat) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
    window.setTimeout(() => toursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function selectTour(tour: BoatTour) {
    setSelectedTourId(tour.id);
    window.setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function changeBoatFromBooking(boat: Boat) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
  }

  if (isError) {
    return (
      <section className="section-y pt-28">
        <Container>
          <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-6 text-white">
            <p className="font-bold">We couldn’t load the booking information. Please try again.</p>
            <button className="mt-4 rounded-xl bg-ocean-500 px-4 py-2 font-bold text-ocean-950" type="button" onClick={() => { boatsQuery.refetch(); toursQuery.refetch(); }}>Retry</button>
          </div>
        </Container>
      </section>
    );
  }

  if (isLoading || !selectedBoat) {
    return <section className="section-y pt-28 text-center text-white">Loading booking information...</section>;
  }

  return (
    <>
      <section className="section-y pt-28">
        <Container>
          <div className="rounded-[2rem] bg-ocean-900 px-6 py-12 text-white shadow-lifted sm:px-10">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{language === 'es' ? 'Reserva por flota' : 'Fleet first booking'}</p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-extrabold leading-tight sm:text-6xl">
              {language === 'es' ? 'Explora Second Wind, elige tu tour y reserva con precio claro' : 'Explore Second Wind, choose your tour and book with clear pricing'}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-ocean-200">
              {language === 'es'
                ? 'El precio base cubre hasta 5 personas. Desde la sexta persona se agregan $65 por persona, con capacidad maxima de 10.'
                : 'The base price covers up to 5 people. From the sixth guest onward, $65 is added per person, with maximum capacity of 10.'}
            </p>
          </div>
        </Container>
      </section>

      <section className="scroll-mt-24 pb-16 sm:pb-20 lg:pb-24" id="fleet">
        <Container>
          <SectionTitle
            align="left"
            eyebrow={language === 'es' ? 'Nuestra flota' : 'Our fleet'}
            title={language === 'es' ? 'Second Wind listo para pesca, playa, surf y aventura privada' : 'Second Wind ready for fishing, beach, surf and private adventure'}
            description={language === 'es'
              ? 'Bote Cigarette de 32 pies con motor Yamaha 250 HP, GPS Garmin, radio VHF, sonido JBL, bano, juguetes acuaticos y seguro.'
              : '32 ft Cigarette boat with Yamaha 250 HP engine, Garmin GPS, VHF radio, JBL sound, restroom, water toys and insurance.'}
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {catalogBoats.map((boat) => (
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
                    ? `Base para ${selectedBoat.includedGuests} personas, maximo ${selectedBoat.maxGuests}. Persona extra $${selectedBoat.extraGuestPrice}.`
                    : `Includes ${selectedBoat.includedGuests} guests, maximum ${selectedBoat.maxGuests}. Extra guest from $${selectedBoat.extraGuestPrice}.`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {groupedTours.map(({ key, tour, relatedTours }) => (
              <BoatTourCard key={key} boat={selectedBoat} tour={tour} relatedTours={relatedTours} isSelected={relatedTours.some((item) => item.id === selectedTour?.id)} onSelect={selectTour} />
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
              ? 'Escoge tipo de tour, paquete por precio, fecha, personas y comida opcional cuando el paquete sea Dia completo.'
              : 'Choose tour type, package by price, date, guests and optional meal when the package is Full Day.'}
          />
          <div className="mt-10">
            <BookingPanel selectedBoat={selectedBoat} selectedTour={selectedTour} boats={catalogBoats} tours={catalogTours} onBoatChange={changeBoatFromBooking} onTourChange={(tour) => setSelectedTourId(tour?.id)} />
          </div>
        </Container>
      </section>
    </>
  );
}

function getTourGroupKey(tour: BoatTour) {
  if (tour.category === 'Bioluminescence Basic' || tour.category === 'Bioluminescence Deluxe') return `${tour.boatId}-Bioluminescence`;
  return `${tour.boatId}-${tour.category}`;
}

function groupToursForCards(tours: BoatTour[]) {
  const groups = new Map<string, BoatTour[]>();

  tours.forEach((tour) => {
    const key = getTourGroupKey(tour);
    groups.set(key, [...(groups.get(key) ?? []), tour]);
  });

  return Array.from(groups.entries()).map(([key, relatedTours]) => ({
    key,
    tour: [...relatedTours].sort((a, b) => a.basePrice - b.basePrice)[0],
    relatedTours: [...relatedTours].sort((a, b) => a.basePrice - b.basePrice),
  }));
}
