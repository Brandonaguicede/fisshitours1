import type { Language } from './LanguageContext';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

type Localized = { en: string; es: string };
type TourText = {
  title: string;
  category: string;
  tags: string[];
  duration?: string;
  activities: string[];
  included: string[];
};

const tourGroups: Record<string, {
  title: Localized;
  category: Localized;
  tags: { en: string[]; es: string[] };
  duration?: Localized;
  activities: { en: string[]; es: string[] };
  included: { en: string[]; es: string[] };
}> = {
  'Snorkeling & Beach': {
    title: { en: 'Beach & Snorkeling', es: 'Playa y Snorkeling' },
    category: { en: 'Snorkeling & Beach', es: 'Snorkeling y Playa' },
    tags: { en: ['Snorkeling', 'Beaches', 'Wildlife'], es: ['Snorkeling', 'Playas', 'Vida marina'] },
    duration: { en: '4-8 hours', es: '4-8 horas' },
    activities: { en: ['Snorkeling', 'Beaches', 'Paddleboarding', 'Subwing', 'Wildlife watching'], es: ['Snorkeling', 'Playas', 'Paddleboard', 'Subwing', 'Avistamiento de fauna'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  Fishing: {
    title: { en: 'Fishing', es: 'Pesca' },
    category: { en: 'Fishing', es: 'Pesca' },
    tags: { en: ['Sport Fishing', 'Expert Crew', 'Equipment'], es: ['Pesca deportiva', 'Tripulacion experta', 'Equipo'] },
    duration: { en: '4-8 hours', es: '4-8 horas' },
    activities: { en: ['Yellowfin tuna', 'Mahi-mahi', 'Marlin', 'Snapper', 'Wahoo', 'Sailfish'], es: ['Atun aleta amarilla', 'Mahi-mahi', 'Marlin', 'Pargo', 'Wahoo', 'Pez vela'] },
    included: { en: ['Penn International and Shimano fishing equipment', 'Experienced local professionals', 'Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Equipo Penn International y Shimano', 'Profesionales locales con experiencia', 'Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  Surfing: {
    title: { en: 'Surfing', es: 'Surf' },
    category: { en: 'Surfing', es: 'Surf' },
    tags: { en: ['Roca Bruja', 'Ollie’s Point', 'All Levels'], es: ['Roca Bruja', 'Ollie’s Point', 'Todos los niveles'] },
    duration: { en: '4-8 hours', es: '4-8 horas' },
    activities: { en: ['Cruising', 'Swimming', 'Roca Bruja', 'Ollie’s Point', 'Skill-level adapted itinerary'], es: ['Navegacion', 'Natacion', 'Roca Bruja', 'Ollie’s Point', 'Ruta adaptada al nivel'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  'Water Toys': {
    title: { en: 'Water Toys', es: 'Juguetes Acuaticos' },
    category: { en: 'Water Toys', es: 'Juguetes Acuaticos' },
    tags: { en: ['Wakeboard', 'Subwing', 'Tubing'], es: ['Wakeboard', 'Subwing', 'Tubing'] },
    duration: { en: '4-8 hours', es: '4-8 horas' },
    activities: { en: ['Wakeboarding', 'Paddleboarding', 'Snorkeling', 'Subwing', 'Tubing'], es: ['Wakeboard', 'Paddleboard', 'Snorkeling', 'Subwing', 'Tubing'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  Bioluminescence: {
    title: { en: 'Bioluminescence', es: 'Bioluminiscencia' },
    category: { en: 'Bioluminescence', es: 'Bioluminiscencia' },
    tags: { en: ['Night Tour', 'Classic', 'Deluxe'], es: ['Tour nocturno', 'Classic', 'Deluxe'] },
    activities: { en: ['Classic Experience', 'Deluxe Experience', 'Night tour', 'Shimmering blue sparks'], es: ['Experiencia Classic', 'Experiencia Deluxe', 'Tour nocturno', 'Destellos azules en el agua'] },
    included: { en: ['Classic: beverages, chips with guacamole and seasonal fruits', 'Deluxe: cheese board, ceviche, sparkling wine and beverages'], es: ['Classic: bebidas, chips con guacamole y frutas de temporada', 'Deluxe: tabla de quesos, ceviche, vino espumante y bebidas'] },
  },
};

export function getTourGroupKey(tour: BoatTour) {
  if (tour.category === 'Bioluminescence Basic' || tour.category === 'Bioluminescence Deluxe') return 'Bioluminescence';
  return tour.category;
}

export function getTourDisplay(tour: BoatTour, language: Language) {
  const key = getTourGroupKey(tour);
  const group = tourGroups[key];

  return group ?? {
    title: tour.name,
    category: tour.category,
    tags: [tour.category],
    duration: tour.duration ? `${tour.duration} ${language === 'es' ? 'horas' : 'hours'}` : undefined,
    activities: [tour.category],
    included: [],
  };
}

export function getTourText(tour: BoatTour, language: Language): TourText {
  if ((tour.activities?.length ?? 0) > 0 || (tour.included?.length ?? 0) > 0 || tour.tourTitle || tour.shortDescription) {
    const dynamicTitle = (tour.tourTitle ?? tour.name.replace(/\s+-\s+.*$/, '')).replace(/\s+Tour$/i, '');
    return {
      title: dynamicTitle,
      category: tour.category,
      tags: tour.activities?.length ? tour.activities : [tour.category],
      duration: tour.duration ? `${tour.duration} ${language === 'es' ? 'horas' : 'hours'}` : undefined,
      activities: tour.activities?.length ? tour.activities : [tour.category],
      included: tour.included ?? [],
    };
  }
  const group = getTourDisplay(tour, language);
  if (typeof group.title === 'string') {
    return {
      title: group.title,
      category: typeof group.category === 'string' ? group.category : tour.category,
      tags: Array.isArray(group.tags) ? group.tags : [tour.category],
      duration: typeof group.duration === 'string' ? group.duration : undefined,
      activities: Array.isArray(group.activities) ? group.activities : [tour.category],
      included: Array.isArray(group.included) ? group.included : [],
    };
  }
  return {
    title: group.title[language],
    category: group.category[language],
    tags: group.tags[language],
    duration: group.duration?.[language],
    activities: group.activities[language],
    included: group.included[language],
  };
}

export function getBoatText(boat: Boat, language: Language) {
  return {
    badge: language === 'es' ? 'Lujo y naturaleza' : boat.badge ?? 'Luxury meets nature',
    length: language === 'es' ? 'Bote Cigarette de 32 pies' : boat.length,
    featuredSpec: language === 'es'
      ? 'Garmin GPS, radio VHF, sonido premium JBL, Bluetooth, bano a bordo, juguetes acuaticos, tuna tube, vivero para carnada, equipo de seguridad y poliza de responsabilidad civil.'
      : boat.featuredSpec,
  };
}

export function getPackageLabel(tour: BoatTour, language: Language) {
  const label = tour.name.replace(/^.* - /, '');
  if (language === 'es') {
    return label
      .replace('Half Day', 'Medio dia')
      .replace('Three-Quarter Day', 'Tres cuartos de dia')
      .replace('Full Day', 'Dia completo')
      .replace('Classic Experience', 'Experiencia Classic')
      .replace('Deluxe Experience', 'Experiencia Deluxe');
  }
  return label;
}

