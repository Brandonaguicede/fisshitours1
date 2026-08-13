import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { boatTours } from '../../data/boatTours';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { formatCurrency } from '../../utils/formatCurrency';
import { getEffectiveMaxGuests, getTourIncludedGuests } from '../../utils/bookingPricing';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { BoatCard } from '../boats/BoatCard';
import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';

interface FleetSectionProps {
  boats: Boat[];
  selectedBoat: Boat;
  onSelectBoat: (boat: Boat) => void;
  onSelectTour: (tour: BoatTour) => void;
}

export function FleetSection({ boats, selectedBoat, onSelectBoat, onSelectTour }: FleetSectionProps) {
  const { language } = useLanguage();
  const [modalBoat, setModalBoat] = useState<Boat | null>(null);

  const modalTours = useMemo(() => {
    if (!modalBoat) return [];
    return boatTours.filter((tour) => tour.boatId === modalBoat.id);
  }, [modalBoat]);

  function openBoatDetails(boat: Boat) {
    onSelectBoat(boat);
    setModalBoat(boat);
  }

  function selectTourAndContinue(tour: BoatTour) {
    if (!modalBoat) return;
    onSelectBoat(modalBoat);
    onSelectTour(tour);
    setModalBoat(null);
  }

  return (
    <section className="section-y scroll-mt-24" data-after-hero="true" id="fleet">
      <Container>
        <SectionTitle
          align="left"
          eyebrow={tr(text.home.fleetEyebrow, language)}
          title={tr(text.home.fleetTitle, language)}
          description={tr(text.home.fleetDescription, language)}
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {boats.map((boat) => (
            <BoatCard key={boat.id} boat={boat} isSelected={boat.id === selectedBoat.id} onSelect={openBoatDetails} />
          ))}
        </div>
      </Container>

      {modalBoat ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ocean-950/75 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/10 bg-ocean-950 shadow-lifted">
            <div className="relative">
              <img className="h-72 w-full rounded-t-[2rem] object-cover" src={modalBoat.image} alt={modalBoat.name} />
              <div className="absolute inset-0 rounded-t-[2rem] bg-gradient-to-t from-ocean-950/80 to-transparent" />
              <button
                className="focus-ring pressable absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-xl"
                type="button"
                aria-label="Close boat details"
                onClick={() => setModalBoat(null)}
              >
                <X size={20} />
              </button>
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-200">{modalBoat.badge ?? 'Private charter'}</p>
                <h3 className="mt-2 text-4xl font-extrabold">{modalBoat.name}</h3>
              </div>
            </div>

            <div className="grid gap-8 p-6 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
              <aside>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-600">Boat details</p>
                <div className="mt-4 grid gap-3 text-sm text-ocean-200">
                  <DetailRow label="Size" value={modalBoat.length} />
                  <DetailRow label="Motor" value={modalBoat.engine} />
                  <DetailRow label="Guests included" value={`${modalBoat.includedGuests} people`} />
                  <DetailRow label="Maximum capacity" value={`${modalBoat.maxGuests} people`} />
                  <DetailRow label="Additional guest" value={`${formatCurrency(modalBoat.extraGuestPrice)} each`} />
                </div>
                <p className="mt-5 rounded-2xl border border-ocean-400/25 bg-ocean-500/10 p-4 text-sm font-semibold leading-6 text-ocean-100">{modalBoat.featuredSpec}</p>
              </aside>

              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-600">Available tours</p>
                <h4 className="mt-2 text-2xl font-extrabold text-white">Choose a tour to continue to payment</h4>
                <div className="mt-5 grid gap-4">
                  {modalTours.map((tour) => {
                    const includedGuests = getTourIncludedGuests(modalBoat, tour);
                    const maxGuests = getEffectiveMaxGuests(modalBoat, tour);

                    return (
                      <article key={tour.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-ocean-400/70 hover:bg-ocean-500/10">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-ocean-600">{tour.category}</p>
                            <h5 className="mt-1 text-xl font-extrabold text-white">{tour.name}</h5>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-ocean-200">
                              {tour.duration} Hours · {includedGuests} guests included · Max {maxGuests} · Extra guest {formatCurrency(tour.extraGuestPrice ?? modalBoat.extraGuestPrice)}
                            </p>
                          </div>
                          <div className="shrink-0 sm:text-right">
                            <p className="text-lg font-extrabold text-ocean-600">{tour.customQuote ? 'Custom quote' : formatCurrency(tour.basePrice)}</p>
                            <Button className="mt-3" type="button" onClick={() => selectTourAndContinue(tour)}>
                              Select and Pay
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ocean-200 pb-2">
      <span>{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
