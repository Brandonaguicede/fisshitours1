import { Gauge, Ruler, Users } from 'lucide-react';

import type { Boat } from '../../types/boat';
import { Button } from '../common/Button';

interface BoatCardProps {
  boat: Boat;
  isSelected: boolean;
  onSelect: (boat: Boat) => void;
}

export function BoatCard({ boat, isSelected, onSelect }: BoatCardProps) {
  return (
    <article className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-400/70 ${isSelected ? 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10' : ''}`}>
      <div className="relative">
        <img className="aspect-[16/10] w-full object-cover" src={boat.image} alt={boat.name} loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ocean-950/70 to-transparent" />
        {boat.badge ? <span className="absolute left-4 top-4 rounded-full bg-ocean-950/70 px-3 py-1 text-xs font-bold text-ocean-100 backdrop-blur-xl">{boat.badge}</span> : null}
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <h3 className="text-2xl font-extrabold text-white">{boat.name}</h3>
            <p className="mt-1 text-sm font-bold text-ocean-400">{boat.basePriceLabel}</p>
          </div>
          <span className="w-fit rounded-full bg-ocean-500/15 px-3 py-1 text-xs font-bold text-ocean-200">Base includes {boat.includedGuests}</span>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-ocean-200 min-[420px]:grid-cols-3">
          <span className="flex items-center gap-2"><Users size={16} className="text-ocean-400" /> Max {boat.maxGuests}</span>
          <span className="flex items-center gap-2"><Ruler size={16} className="text-ocean-400" /> {boat.length}</span>
          <span className="flex items-center gap-2"><Gauge size={16} className="text-ocean-400" /> {boat.engine}</span>
        </div>
        <p className="mt-4 rounded-2xl border border-white/10 bg-ocean-950/35 p-3 text-sm font-semibold text-ocean-100">{boat.featuredSpec}</p>
        <Button className="mt-5 w-full" type="button" onClick={() => onSelect(boat)}>
          Explore Boat
        </Button>
      </div>
    </article>
  );
}
