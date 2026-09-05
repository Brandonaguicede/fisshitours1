import { boatTours } from '../data/boatTours';
import { tours } from '../data/tours';
import type { BoatTour } from '../types/boatTour';
import type { Tour } from '../types/tour';

export type BookableTour = Tour | BoatTour;

export function isBoatTour(item: BookableTour): item is BoatTour {
  return 'basePrice' in item;
}

export async function getTours() {
  return Promise.resolve(tours);
}

export async function getTourBySlug(slug: string) {
  return Promise.resolve(tours.find((tour) => tour.slug === slug));
}

export async function getBoatTourById(id: string) {
  return Promise.resolve(boatTours.find((tour) => tour.id === id));
}

export async function getBookableTourBySlug(slug: string): Promise<BookableTour | undefined> {
  const legacy = tours.find((tour) => tour.slug === slug);
  if (legacy) return legacy;
  return boatTours.find((tour) => tour.id === slug);
}