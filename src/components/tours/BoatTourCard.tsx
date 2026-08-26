import { Compass, Clock, Users } from 'lucide-react';
import { useState } from 'react';

import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { CardActions, CardContent, CardMedia, CardShell, PriceLabel, SpecItem, SpecsGrid } from '../ui';
import { TourDetailModal } from './TourDetailModal';

interface BoatTourCardProps {
  boat: Boat;
  tour: BoatTour;
  relatedTours?: BoatTour[];
  isSelected: boolean;
  onSelect: (tour: BoatTour) => void;
}

function getLowestPrice(tours: BoatTour[]) {
  return Math.min(...tours.map((item) => item.basePrice));
}

export function BoatTourCard({ boat, tour, relatedTours, isSelected, onSelect }: BoatTourCardProps) {
  const { language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const packageTours = relatedTours?.length ? relatedTours : [tour];
  const display = getTourText(tour, language);
  const effectiveMaxGuests = getEffectiveMaxGuests(boat, tour);
  const lowestPrice = getLowestPrice(packageTours);

  return (
    <>
      <article className="h-full w-full">
        <CardShell
          as="button"
          aria-label={`${language === 'es' ? 'Ver tour' : 'View tour'} ${display.title}`}
          interactive
          onClick={() => setIsModalOpen(true)}
          selected={isSelected}
          type="button"
        >
          <CardMedia
            alt={language === 'es' ? `Tour ${display.title} a bordo de ${boat.name}` : `${display.title} tour aboard ${boat.name}`}
            src={tour.image}
            title={display.title}
          />

          <CardContent>
            <PriceLabel label={language === 'es' ? 'Desde' : 'From'} value={formatTourPrice(lowestPrice)} />

            <SpecsGrid>
              <SpecItem icon={Clock} value={getDurationLabel(tour, display.duration, language)} />
              <SpecItem icon={Users} value={language === 'es' ? `Hasta ${effectiveMaxGuests} personas` : `Up to ${effectiveMaxGuests} guests`} />
              <SpecItem icon={Compass} value={display.category} />
            </SpecsGrid>

            <div className="mt-4 grid gap-1.5">
              {packageTours.slice(0, 3).map((item) => (
                <div className="flex items-center justify-between gap-3 text-xs font-bold text-ocean-200" key={item.id}>
                  <span className="truncate">{item.name.replace(/^.* - /, '')}</span>
                  <span className="shrink-0 text-ocean-400">{formatCurrency(item.basePrice)}</span>
                </div>
              ))}
            </div>

            <CardActions>{language === 'es' ? 'Ver tour' : 'View Tour'}</CardActions>
          </CardContent>
        </CardShell>
      </article>

      <TourDetailModal
        boat={boat}
        onClose={() => setIsModalOpen(false)}
        onSelect={onSelect}
        open={isModalOpen}
        packageTours={packageTours}
        tour={tour}
      />
    </>
  );
}

function formatTourPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getDurationLabel(tour: BoatTour, localizedDuration: string | undefined, language: 'en' | 'es') {
  if (localizedDuration) return localizedDuration;
  const slot = tour.timeSlots[0];
  if (!slot) return language === 'es' ? 'Consultar' : 'On request';
  return slot.time;
}
