import { tours } from '../data/tours';

export async function getTours() {
  return Promise.resolve(tours);
}

export async function getTourBySlug(slug: string) {
  return Promise.resolve(tours.find((tour) => tour.slug === slug));
}
