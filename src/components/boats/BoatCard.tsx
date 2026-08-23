import { Gauge, Ruler, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Boat } from '../../types/boat';
import { getBoatText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';

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
      <button
        className={`focus-ring glass-surface glass-interactive group flex h-full w-full appearance-none flex-col overflow-hidden rounded-[1.65rem] p-0 text-left ${
          isSelected ? 'ring-1 ring-inset ring-ocean-200/45' : ''
        }`}
        type="button"
        aria-label={`${language === 'es' ? 'Ver barco' : 'Explore boat'} ${boat.name}`}
        onClick={() => onSelect(boat)}
      >
        <span className="relative block h-48 w-full shrink-0 overflow-hidden bg-ocean-900 sm:h-52">
          <img
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            src={boat.image}
            alt={boat.name}
            loading="lazy"
            decoding="async"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-transparent to-ocean-950/10" />
          <span className="absolute inset-x-5 bottom-4">
            <span className="block font-display text-[1.75rem] font-semibold leading-none text-white">{boat.name}</span>
          </span>
        </span>

        <span className="flex w-full flex-1 flex-col p-4 sm:p-5">
          <span className="text-sm font-semibold text-ocean-200">
            {language === 'es' ? 'Desde' : 'From'} {formatStartingPrice(startingPrice)}
          </span>

          <span className="mt-4 grid grid-cols-3 gap-2">
            <SpecChip icon={<Users size={15} />} value={`${language === 'es' ? 'Máx.' : 'Max'} ${boat.maxGuests}`} />
            <SpecChip icon={<Ruler size={15} />} value={boatText.length} />
            <SpecChip icon={<Gauge size={15} />} value={boat.engine} />
          </span>

          <span className="glass-primary glass-interactive mt-4 flex min-h-10 w-full items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-ocean-950">
            {language === 'es' ? 'Ver barco' : 'Explore Boat'}
          </span>
        </span>
      </button>
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

function SpecChip({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="glass-control flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-center text-[0.7rem] font-medium leading-tight text-ocean-100">
      <span className="text-ocean-400">{icon}</span>
      <span className="w-full truncate">{value}</span>
    </span>
  );
}
