export type TourCategory =
  | 'Fishing'
  | 'Snorkeling & Beach'
  | 'Surfing'
  | 'Bioluminescence Basic'
  | 'Bioluminescence Deluxe'
  | 'Water Toys';

export interface TourTimeSlot {
  id: string;
  label: string;
  time: string;
}

export interface BoatTour {
  id: string;
  boatId: string;
  /** Physical capacity of the boat that offers this package. Absolute safety ceiling. */
  boatMaxGuests?: number;
  boatTourId?: string;
  tourId?: string;
  tourTitle?: string;
  /** Spanish version of `tourTitle`, filled by "Traducir todo el sitio" — `tourTitle` itself may already be in either language. */
  tourTitleEs?: string;
  /** English version of `tourTitle`, filled by "Traducir todo el sitio" — `tourTitle` itself may already be in either language. */
  tourTitleEn?: string;
  /** The parent tour's own `sort_order` — drives display order in grouped catalogs (one entry per tour, independent of package-level ordering). */
  tourSortOrder?: number;
  /** Shared tour content; commercial fields below still belong to this package. */
  tourDetails?: {
    title: string;
    description: string;
    image: string;
    galleryImages: Array<{ src: string; alt: string; altEs?: string; altEn?: string }>;
    activities: string[];
  };
  catalogActive?: boolean;
  name: string;
  packageType?: string;
  mealOptions?: Array<{ es: string; en: string }>;
  departureTimes?: string[] | null;
  category: TourCategory;
  description: string;
  /** Spanish version of `description`, filled by "Traducir todo el sitio" — `description` itself may already be in either language. */
  descriptionEs?: string;
  /** English version of `description`, filled by "Traducir todo el sitio" — `description` itself may already be in either language. */
  descriptionEn?: string;
  shortDescription?: string;
  /** Spanish version of `shortDescription`, filled by "Traducir todo el sitio" — `shortDescription` itself may already be in either language. */
  shortDescriptionEs?: string;
  /** English version of `shortDescription`, filled by "Traducir todo el sitio" — `shortDescription` itself may already be in either language. */
  shortDescriptionEn?: string;
  activities?: string[];
  /** Spanish version of `activities` (same order), filled by "Traducir todo el sitio" — `activities` itself may already be in either language. */
  activitiesEs?: string[];
  /** English version of `activities` (same order), filled by "Traducir todo el sitio" — `activities` itself may already be in either language. */
  activitiesEn?: string[];
  included?: string[];
  /** Spanish version of `included` (same order), filled by "Traducir todo el sitio" — `included` itself may already be in either language. */
  includedEs?: string[];
  /** English version of `included` (same order), filled by "Traducir todo el sitio" — `included` itself may already be in either language. */
  includedEn?: string[];
  galleryImages?: Array<{ src: string; alt: string; altEs?: string; altEn?: string }>;
  duration?: number;
  /** All commercial terms below come from tour_packages — the single source of truth. */
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  customQuote: boolean;
  image: string;
  timeSlots: TourTimeSlot[];
}
