export interface Boat {
  id: string;
  slug: string;
  name: string;
  image: string;
  images?: string[];
  badge?: string;
  basePriceLabel: string;
  length: string;
  engine: string;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  featuredSpec: string;
  tours: string[];
}
