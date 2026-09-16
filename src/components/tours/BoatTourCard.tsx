import { Ship } from 'lucide-react';
import { useState } from 'react';
import type { BoatTour } from '../../types/boatTour';
import type { TourCatalogItem } from '../../utils/tourCatalog';
import { getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { CardActions, CardContent, CardMedia, CardShell, PriceLabel, SpecItem, SpecsGrid } from '../ui';
import { TourDetailModal } from './TourDetailModal';

interface BoatTourCardProps {
  catalogItem: TourCatalogItem;
  isSelected: boolean;
  mediaClassName?: string;
  onSelect: (tour: BoatTour) => void;
}

export function BoatTourCard({ catalogItem, isSelected, mediaClassName, onSelect }: BoatTourCardProps) {
  const { language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSession, setModalSession] = useState(0);
  const { tour, boatOptions, fromPrice } = catalogItem;
  const display = getTourText(tour, language);
  const boatCount = new Set(boatOptions.map((option) => option.boat.id)).size;

  return <>
    <article className="card-shadow-pool h-full w-full">
      <CardShell as="button" aria-label={(language === 'es' ? 'Ver tour ' : 'View tour ') + display.title}
        className="card-shell-soft" interactive onClick={() => { setModalSession((session) => session + 1); setIsModalOpen(true); }} selected={isSelected} type="button">
        <CardMedia alt={display.title} className={mediaClassName} src={tour.tourDetails?.image ?? tour.image} title={display.title} />
        <CardContent>
          <PriceLabel label={language === 'es' ? 'Desde' : 'From'} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(fromPrice)} />
          <SpecsGrid className="grid-cols-1">
            <SpecItem icon={Ship} value={boatCount + (language === 'es' ? (boatCount === 1 ? ' bote disponible' : ' botes disponibles') : (boatCount === 1 ? ' boat available' : ' boats available'))} />
          </SpecsGrid>
          <p className="mt-2.5 text-xs font-bold text-ocean-200">{language === 'es' ? 'Elige bote y paquete para ver los detalles.' : 'Choose a boat and package to see the details.'}</p>
          <span aria-hidden="true" className="flex-1" />
          <CardActions>{language === 'es' ? 'Ver tour' : 'View Tour'}</CardActions>
        </CardContent>
      </CardShell>
    </article>
    <TourDetailModal key={modalSession} boat={boatOptions[0].boat} boatOptions={boatOptions} tour={tour}
      packageTours={[]} open={isModalOpen} onClose={() => setIsModalOpen(false)} onSelect={onSelect} />
  </>;
}
