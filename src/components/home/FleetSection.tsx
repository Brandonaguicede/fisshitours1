import { X } from 'lucide-react';
import { useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { boatTours } from '../../data/boatTours';
import { getBoatText, getTourGroupKey, getTourText } from '../../i18n/content';
import type { Language } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils/formatCurrency';
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
  onViewTourType: (tour: BoatTour) => void;
}

export function FleetSection({ boats, selectedBoat, onSelectBoat, onViewTourType }: FleetSectionProps) {
  const { language } = useLanguage();
  const [modalBoat, setModalBoat] = useState<Boat | null>(null);
  const modalBoatText = modalBoat ? getBoatText(modalBoat, language) : null;

  function openBoatDetails(boat: Boat) {
    onSelectBoat(boat);
    setModalBoat(boat);
  }

  const modalTourTypes = getModalTourTypes(modalBoat, language);

  function handleViewTourType(tour: BoatTour) {
    onViewTourType(tour);
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
        <div className="fixed inset-0 z-[90] grid place-items-start bg-ocean-950/75 px-3 py-4 backdrop-blur-sm sm:place-items-center sm:px-4 sm:py-8">
          <div className="max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-ocean-950 shadow-lifted sm:max-h-[90dvh] sm:rounded-[2rem]">
            <div className="relative">
              <img className="h-48 w-full rounded-t-2xl object-cover sm:h-72 sm:rounded-t-[2rem]" src={modalBoat.image} alt={modalBoat.name} />
              <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-ocean-950/80 to-transparent sm:rounded-t-[2rem]" />
              <button
                className="focus-ring pressable absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-xl"
                type="button"
                aria-label="Close boat details"
                onClick={() => setModalBoat(null)}
              >
                <X size={20} />
              </button>
              <div className="absolute bottom-4 left-4 right-4 text-white sm:bottom-6 sm:left-6 sm:right-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-ocean-200 sm:text-sm">{modalBoatText?.badge ?? (language === 'es' ? 'Charter privado' : 'Private charter')}</p>
                <h3 className="mt-1 text-3xl font-extrabold sm:mt-2 sm:text-4xl">{modalBoat.name}</h3>
              </div>
            </div>

            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8 lg:p-8">
              <aside>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-600">{language === 'es' ? 'Detalles del barco' : 'Boat details'}</p>
                <div className="mt-4 grid gap-3 text-sm text-ocean-200">
                  <DetailRow label={language === 'es' ? 'Tamano' : 'Size'} value={modalBoatText?.length ?? modalBoat.length} />
                  <DetailRow label={language === 'es' ? 'Motor' : 'Motor'} value={modalBoat.engine} />
                  <DetailRow label={language === 'es' ? 'Capacidad maxima' : 'Maximum capacity'} value={language === 'es' ? `${modalBoat.maxGuests} personas` : `${modalBoat.maxGuests} people`} />
                  <DetailRow label={language === 'es' ? 'Persona extra' : 'Additional guest'} value={language === 'es' ? `${formatCurrency(modalBoat.extraGuestPrice)} cada una` : `${formatCurrency(modalBoat.extraGuestPrice)} each`} />
                </div>
                <p className="mt-4 rounded-2xl border border-ocean-400/25 bg-ocean-500/10 p-3 text-sm font-semibold leading-6 text-ocean-100 sm:mt-5 sm:p-4">{modalBoatText?.featuredSpec ?? modalBoat.featuredSpec}</p>
              </aside>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-soft sm:p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-600">{language === 'es' ? 'Tipos de tour' : 'Tour types'}</p>
                <h4 className="mt-2 text-xl font-extrabold leading-tight text-white sm:text-2xl">{language === 'es' ? 'Elige la experiencia que quieres explorar' : 'Choose the experience you want to explore'}</h4>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {modalTourTypes.map((tour) => (
                    <button
                      key={tour.key}
                      className="focus-ring group min-w-0 rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-ocean-400/70 hover:bg-ocean-500/10"
                      type="button"
                      onClick={() => handleViewTourType(tour.representativeTour)}
                    >
                      <p className="truncate text-left text-xs font-extrabold uppercase tracking-[0.1em] text-ocean-500">{tour.category}</p>
                      <div className="mt-2 grid min-w-0 gap-2">
                        <h5 className="min-w-0 text-left text-base font-extrabold leading-tight text-white sm:text-lg">{tour.title}</h5>
                        <span className="w-fit max-w-full rounded-full bg-ocean-500/10 px-2.5 py-1 text-left text-xs font-extrabold leading-tight text-ocean-400 sm:text-sm">
                          {language === 'es' ? 'Desde' : 'From'} {formatCurrency(tour.price)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <Button className="mt-5" type="button" onClick={() => modalTourTypes[0] && handleViewTourType(modalTourTypes[0].representativeTour)}>
                  {language === 'es' ? 'Ver todos los tours' : 'View All Tours'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getModalTourTypes(boat: Boat | null, language: Language) {
  if (!boat) return [];

  const groups = new Map<string, BoatTour[]>();
  boatTours
    .filter((tour) => tour.boatId === boat.id)
    .forEach((tour) => {
      const key = getTourGroupKey(tour);
      groups.set(key, [...(groups.get(key) ?? []), tour]);
    });

  return Array.from(groups.entries()).map(([key, relatedTours]) => {
    const sortedTours = [...relatedTours].sort((a, b) => a.basePrice - b.basePrice);
    const display = getTourText(sortedTours[0], language);
    return {
      key,
      title: display.title,
      category: display.category,
      price: sortedTours[0].basePrice,
      representativeTour: sortedTours[0],
    };
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ocean-200 pb-2">
      <span>{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
