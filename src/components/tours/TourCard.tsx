import { ArrowUpRight, Clock, MapPin, Star } from 'lucide-react';

import type { Tour } from '../../types/tour';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button } from '../common/Button';

interface TourCardProps {
  tour: Tour;
}

export function TourCard({ tour }: TourCardProps) {
  return (
    <article className="glass-card group overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-1 hover:border-ocean-500 hover:shadow-lifted">
      <div className="relative overflow-hidden">
        <img className="aspect-[4/3] w-full object-cover transition duration-700 ease-out group-hover:scale-105" src={tour.image} alt={tour.title} loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ocean-950/65 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-ocean-950/75 px-3 py-1 text-xs font-bold text-ocean-100 backdrop-blur">{tour.category}</span>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-ocean-200">
            <MapPin size={16} className="text-ocean-600" /> {tour.location}
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-ocean-100">
            <Star className="fill-amber-400 text-amber-400" size={16} /> {tour.rating}
          </span>
        </div>
        <h3 className="mt-4 text-xl font-extrabold leading-tight text-white">{tour.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ocean-200">{tour.description}</p>
        {tour.duration ? (
          <span className="mt-4 flex items-center gap-2 text-sm text-ocean-200">
            <Clock size={16} className="text-ocean-600" /> {tour.duration}
          </span>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-lg font-extrabold text-ocean-400">{formatCurrency(tour.price)}</span>
          <Button className="gap-2 px-4" to={`/tours/${tour.slug}`}>
            Ver <ArrowUpRight size={16} />
          </Button>
        </div>
      </div>
    </article>
  );
}
