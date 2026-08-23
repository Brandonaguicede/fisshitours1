import { ArrowUpRight, Gauge, Ruler, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Boat } from '../../types/boat';
import { getBoatText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';

interface BoatCardProps {
  boat: Boat;
  isSelected: boolean;
  onSelect: (boat: Boat) => void;
}

export function BoatCard({ boat, isSelected, onSelect }: BoatCardProps) {
  const { language } = useLanguage();
  const boatText = getBoatText(boat, language);

  return (
    <article className="w-[min(88vw,22.5rem)] shrink-0 snap-start lg:w-[23rem]">
      <button
        className={`focus-ring group flex h-full w-full flex-col overflow-hidden rounded-[1.65rem] border bg-white/[0.045] text-left shadow-[0_16px_44px_rgba(0,0,0,0.2)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-300/45 hover:bg-white/[0.065] hover:shadow-[0_22px_54px_rgba(0,0,0,0.26)] ${
          isSelected ? 'border-ocean-300/60 ring-4 ring-ocean-400/10' : 'border-white/10'
        }`}
        type="button"
        aria-label={`${language === 'es' ? 'Ver barco' : 'Explore boat'} ${boat.name}`}
        onClick={() => onSelect(boat)}
      >
        <span className="relative block h-48 w-full overflow-hidden bg-ocean-900 sm:h-52">
          <img
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            src={boat.image}
            alt={boat.name}
            loading="lazy"
            decoding="async"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-transparent to-ocean-950/10" />
          {boat.badge ? (
            <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-ocean-950/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
              {boatText.badge}
            </span>
          ) : null}
          <span className="absolute inset-x-5 bottom-4">
            <span className="block font-display text-[1.75rem] font-semibold leading-none text-white">{boat.name}</span>
          </span>
        </span>

        <span className="flex w-full flex-1 flex-col p-4 sm:p-5">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ocean-200">
              {boatText.basePriceLabel} <span className="font-medium text-ocean-300">{language === 'es' ? 'por barco' : 'per boat'}</span>
            </span>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-ocean-100 backdrop-blur-xl">
              {language === 'es' ? `Base incluye ${boat.includedGuests}` : `Base includes ${boat.includedGuests}`}
            </span>
          </span>

          <span className="mt-4 grid grid-cols-3 gap-2">
            <SpecChip icon={<Users size={15} />} value={`${language === 'es' ? 'Máx.' : 'Max'} ${boat.maxGuests}`} />
            <SpecChip icon={<Ruler size={15} />} value={boatText.length} />
            <SpecChip icon={<Gauge size={15} />} value={boat.engine} />
          </span>

          <span className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-ocean-200/25 bg-ocean-300/90 px-5 py-2 text-sm font-semibold text-ocean-950 shadow-soft backdrop-blur-xl transition duration-200 group-hover:bg-[#7ED8F4]">
            {language === 'es' ? 'Ver barco' : 'Explore Boat'}
            <ArrowUpRight size={17} aria-hidden="true" />
          </span>
        </span>
      </button>
    </article>
  );
}

function SpecChip({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.045] px-2 py-2.5 text-center text-[0.7rem] font-medium leading-tight text-ocean-100 backdrop-blur-xl">
      <span className="text-ocean-400">{icon}</span>
      <span className="w-full truncate">{value}</span>
    </span>
  );
}
