import { Gauge, Ruler, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Boat } from '../../types/boat';
import { getBoatText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../common/Button';

interface BoatCardProps {
  boat: Boat;
  isSelected: boolean;
  onSelect: (boat: Boat) => void;
}

export function BoatCard({ boat, isSelected, onSelect }: BoatCardProps) {
  const { language } = useLanguage();
  const boatText = getBoatText(boat, language);
  const images = boat.images?.length ? boat.images : [boat.image];
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveImage((index) => (index + 1) % images.length);
    }, 3200);

    return () => window.clearInterval(interval);
  }, [images.length]);

  return (
    <article className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-soft backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-ocean-400/70 ${isSelected ? 'border-ocean-400 bg-ocean-500/15 ring-4 ring-ocean-500/10' : ''}`}>
      <div className="relative aspect-[16/10] overflow-hidden">
        {images.map((image, index) => (
          <img
            key={image}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeImage ? 'opacity-100' : 'opacity-0'}`}
            src={image}
            alt={index === 0 ? boat.name : ''}
            aria-hidden={index === 0 ? undefined : true}
            loading={index === 0 ? 'lazy' : 'eager'}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ocean-950/70 to-transparent" />
        {boat.badge ? <span className="absolute left-4 top-4 rounded-full bg-ocean-950/70 px-3 py-1 text-xs font-bold text-ocean-100 backdrop-blur-xl">{boatText.badge}</span> : null}
        {images.length > 1 ? (
          <div className="absolute bottom-4 left-4 flex gap-1.5" aria-hidden="true">
            {images.map((image, index) => (
              <span key={image} className={`h-1.5 rounded-full transition-all duration-300 ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="min-w-0">
            <h3 className="text-2xl font-extrabold text-white">{boat.name}</h3>
            <p className="mt-1 text-sm font-bold text-ocean-400">{boatText.basePriceLabel}</p>
          </div>
          <span className="w-fit rounded-full bg-ocean-500/15 px-3 py-1 text-xs font-bold text-ocean-200">{language === 'es' ? `Base incluye ${boat.includedGuests}` : `Base includes ${boat.includedGuests}`}</span>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-ocean-200 min-[420px]:grid-cols-3">
          <span className="flex items-center gap-2"><Users size={16} className="text-ocean-400" /> {language === 'es' ? 'Max' : 'Max'} {boat.maxGuests}</span>
          <span className="flex items-center gap-2"><Ruler size={16} className="text-ocean-400" /> {boatText.length}</span>
          <span className="flex items-center gap-2"><Gauge size={16} className="text-ocean-400" /> {boat.engine}</span>
        </div>
        <p className="mt-4 rounded-2xl border border-white/10 bg-ocean-950/35 p-3 text-sm font-semibold text-ocean-100">{boatText.featuredSpec}</p>
        <Button className="mt-5 w-full" type="button" onClick={() => onSelect(boat)}>
          {language === 'es' ? 'Ver barco' : 'Explore Boat'}
        </Button>
      </div>
    </article>
  );
}
