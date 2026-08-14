export interface Tour {
  id: string;
  title: string;
  slug: string;
  location: string;
  description: string;
  longDescription: string;
  image: string;
  price: number;
  duration?: string;
  rating: number;
  category: string;
  highlights: string[];
  included: string[];
}
