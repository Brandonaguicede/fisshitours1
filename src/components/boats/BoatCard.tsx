import { Gauge, Ruler, Users } from 'lucide-react';

import type { Boat } from '../../types/boat';
import { getBoatText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { CardActions, CardContent, CardMedia, CardShell, PriceLabel, SpecItem, SpecsGrid } from '../ui';

interface BoatCardProps {
  boat: Boat;
  startingPrice: number;
  isSelected: boolean;
  onSelect: (boat: Boat) => void;
}

export function BoatCard({ boat, startingPrice, isSelected, onSelect }: BoatCardProps) {
  const { language } = useLanguage();
  const boatText = getBoatText(boat, language);

  return (
    <article className="w-[min(88vw,22.5rem)] shrink-0 snap-start lg:w-[23rem]">
      <CardShell
        as="button"
        aria-label={`${language === 'es' ? 'Ver barco' : 'Explore boat'} ${boat.name}`}
        interactive
        onClick={() => onSelect(boat)}
        selected={isSelected}
        type="button"
      >
        <CardMedia alt={boat.name} src={boat.image} title={boat.name} />

        <CardContent>
          <PriceLabel label={language === 'es' ? 'Desde' : 'From'} value={formatStartingPrice(startingPrice)} />

          <SpecsGrid>
            <SpecItem icon={Users} value={`${language === 'es' ? 'Máx.' : 'Max'} ${boat.maxGuests}`} />
            <SpecItem icon={Ruler} value={boatText.length} />
            <SpecItem icon={Gauge} value={boat.engine} />
          </SpecsGrid>

          <CardActions>{language === 'es' ? 'Ver barco' : 'Explore Boat'}</CardActions>
        </CardContent>
      </CardShell>
    </article>
  );
}

function formatStartingPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
