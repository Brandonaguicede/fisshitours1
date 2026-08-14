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
    basePriceLabel: language === 'es' ? boat.basePriceLabel.replace('From', 'Desde') : boat.basePriceLabel,
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

const tourPageText: Record<string, {
  title: Localized;
  category: Localized;
  description: Localized;
  longDescription: Localized;
  duration?: Localized;
  highlights: { en: string[]; es: string[] };
  included: { en: string[]; es: string[] };
}> = {
  'beach-snorkeling-tour': {
    title: { en: 'Beach & Snorkeling Tour', es: 'Tour de Playa y Snorkeling' },
    category: { en: 'Snorkeling & Beach', es: 'Snorkeling y Playa' },
    description: { en: 'Discover stunning beaches and vibrant marine life with snorkeling, paddleboarding, subwing or relaxed time in crystal-clear waters.', es: 'Descubre playas impresionantes y vida marina con snorkeling, paddleboard, subwing o tiempo para relajarte en aguas cristalinas.' },
    longDescription: { en: 'Discover the stunning beaches and vibrant marine life of the Gulf of Papagayo. Enjoy snorkeling, paddleboarding, subwing or simply relax in crystal-clear waters while observing dolphins, whales and sea turtles in their natural habitat.', es: 'Descubre las playas y la vida marina del Golfo de Papagayo. Disfruta snorkeling, paddleboard, subwing o relajate en aguas cristalinas mientras observas delfines, ballenas y tortugas marinas.' },
    duration: { en: 'Half day 4 hours, three-quarter day 6 hours, full day 8 hours', es: 'Medio dia 4 horas, tres cuartos 6 horas, dia completo 8 horas' },
    highlights: { en: ['Snorkeling', 'Paddleboarding', 'Subwing', 'Wildlife watching'], es: ['Snorkeling', 'Paddleboard', 'Subwing', 'Avistamiento de fauna'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  'fishing-tour': {
    title: { en: 'Fishing Tour', es: 'Tour de Pesca' },
    category: { en: 'Fishing', es: 'Pesca' },
    description: { en: 'An unforgettable fishing adventure for experienced anglers and beginners with Penn International and Shimano equipment.', es: 'Una aventura de pesca inolvidable para pescadores expertos y principiantes con equipo Penn International y Shimano.' },
    longDescription: { en: 'An unforgettable fishing adventure guided by experienced local professionals. Target species include yellowfin tuna, mahi-mahi, marlin, snapper, wahoo and sailfish.', es: 'Una aventura de pesca guiada por profesionales locales con experiencia. Las especies objetivo incluyen atun aleta amarilla, mahi-mahi, marlin, pargo, wahoo y pez vela.' },
    duration: { en: 'Half day 4 hours, three-quarter day 6 hours, full day 8 hours', es: 'Medio dia 4 horas, tres cuartos 6 horas, dia completo 8 horas' },
    highlights: { en: ['Yellowfin tuna', 'Mahi-mahi', 'Marlin', 'Snapper', 'Wahoo', 'Sailfish'], es: ['Atun aleta amarilla', 'Mahi-mahi', 'Marlin', 'Pargo', 'Wahoo', 'Pez vela'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  'surfing-tour': {
    title: { en: 'Surfing Tour', es: 'Tour de Surf' },
    category: { en: 'Surfing', es: 'Surf' },
    description: { en: 'Cruise, swim and surf at Roca Bruja and Ollie’s Point with the itinerary adapted to the participants’ skill level.', es: 'Navega, nada y surfea en Roca Bruja y Ollie’s Point con una ruta adaptada al nivel de los participantes.' },
    longDescription: { en: 'Enjoy cruising, swimming and surfing at two iconic Costa Rican surf locations: Roca Bruja and Ollie’s Point.', es: 'Disfruta navegacion, natacion y surf en dos lugares iconicos de Costa Rica: Roca Bruja y Ollie’s Point.' },
    duration: { en: 'Half day 4 hours, three-quarter day 6 hours, full day 8 hours', es: 'Medio dia 4 horas, tres cuartos 6 horas, dia completo 8 horas' },
    highlights: { en: ['Roca Bruja', 'Ollie’s Point', 'Cruising', 'Swimming'], es: ['Roca Bruja', 'Ollie’s Point', 'Navegacion', 'Natacion'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  'water-toys-tour': {
    title: { en: 'Water Toys Tour', es: 'Tour de Juguetes Acuaticos' },
    category: { en: 'Water Toys', es: 'Juguetes Acuaticos' },
    description: { en: 'A tour that combines adrenaline, adventure, relaxation and fun in the Gulf of Papagayo.', es: 'Un tour que combina adrenalina, aventura, relajacion y diversion en el Golfo de Papagayo.' },
    longDescription: { en: 'Available activities include wakeboarding, paddleboarding, snorkeling, subwing and tubing.', es: 'Las actividades disponibles incluyen wakeboard, paddleboard, snorkeling, subwing y tubing.' },
    duration: { en: 'Half day 4 hours, three-quarter day 6 hours, full day 8 hours', es: 'Medio dia 4 horas, tres cuartos 6 horas, dia completo 8 horas' },
    highlights: { en: ['Wakeboarding', 'Paddleboarding', 'Snorkeling', 'Subwing', 'Tubing'], es: ['Wakeboard', 'Paddleboard', 'Snorkeling', 'Subwing', 'Tubing'] },
    included: { en: ['Alcoholic and non-alcoholic beverages', 'Chips with guacamole', 'Seasonal fruits', 'Lunch on full-day tours'], es: ['Bebidas alcoholicas y sin alcohol', 'Chips con guacamole', 'Frutas de temporada', 'Almuerzo en tours Full Day'] },
  },
  'bioluminescence-tour': {
    title: { en: 'Bioluminescence Tour', es: 'Tour de Bioluminiscencia' },
    category: { en: 'Bioluminescence', es: 'Bioluminiscencia' },
    description: { en: 'Discover the magical phenomenon of bioluminescence as night turns the ocean into a sea of stars.', es: 'Descubre el fenomeno magico de la bioluminiscencia mientras la noche transforma el oceano en un mar de estrellas.' },
    longDescription: { en: 'As night falls, every movement creates shimmering blue sparks. Classic and Deluxe experiences are available.', es: 'Al caer la noche, cada movimiento crea destellos azules. Hay experiencias Classic y Deluxe disponibles.' },
    highlights: { en: ['Classic Experience from $650', 'Deluxe Experience from $750', 'Shimmering blue sparks', 'Night ocean experience'], es: ['Experiencia Classic desde $650', 'Experiencia Deluxe desde $750', 'Destellos azules', 'Experiencia nocturna'] },
    included: { en: ['Classic beverages and snacks', 'Deluxe cheese board', 'Deluxe ceviche', 'Deluxe sparkling wine'], es: ['Bebidas y snacks Classic', 'Tabla de quesos Deluxe', 'Ceviche Deluxe', 'Vino espumante Deluxe'] },
  },
};

export function getTourPageText(slug: string, language: Language) {
  const item = tourPageText[slug];
  if (!item) return null;
  return {
    title: item.title[language],
    category: item.category[language],
    description: item.description[language],
    longDescription: item.longDescription[language],
    duration: item.duration?.[language],
    highlights: item.highlights[language],
    included: item.included[language],
  };
}
