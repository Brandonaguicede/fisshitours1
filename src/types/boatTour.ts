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
  name: string;
  category: TourCategory;
  description: string;
  duration?: number;
  basePrice: number;
  includedGuests?: number;
  maxGuests?: number;
  extraGuestPrice?: number;
  customQuote?: boolean;
  image: string;
  timeSlots: TourTimeSlot[];
}
