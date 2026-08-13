export type TourCategory =
  | 'Fishing'
  | 'Half Day Fishing'
  | '3/4 Day Fishing'
  | 'Full Day Fishing'
  | 'Snorkeling & Beach'
  | 'Bioluminescence Basic'
  | 'Bioluminescence Deluxe'
  | 'Toy Tour'
  | 'Custom Tour'
  | 'Half Fishing + Half Beach';

export interface TourTimeSlot {
  id: string;
  label: string;
  time: string;
}

export interface BoatTour {
  id: string;
  boatId: string;
  name: string;
  category: TourCategory;
  description: string;
  duration: number;
  basePrice: number;
  includedGuests?: number;
  maxGuests?: number;
  extraGuestPrice?: number;
  customQuote?: boolean;
  image: string;
  timeSlots: TourTimeSlot[];
}
