import { tours } from '../data/tours';
import { supabase } from '../lib/supabase';
import type { Tour } from '../types/tour';

export async function getTours(): Promise<Tour[]> {
  const { data, error } = await supabase.from('tours').select('*').eq('active', true).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const fallback = tours.find((tour) => tour.slug === row.slug);
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      location: row.location ?? fallback?.location ?? '',
      description: row.description ?? fallback?.description ?? '',
      longDescription: row.long_description ?? fallback?.longDescription ?? row.description ?? '',
      image: row.image_url ?? fallback?.image ?? '/images/placeholder-image.jpg',
      price: fallback?.price ?? 0,
      duration: fallback?.duration,
      rating: Number(row.rating ?? fallback?.rating ?? 0),
      category: row.category,
      highlights: Array.isArray(row.highlights) ? row.highlights.filter((item): item is string => typeof item === 'string') : fallback?.highlights ?? [],
      included: Array.isArray(row.included) ? row.included.filter((item): item is string => typeof item === 'string') : fallback?.included ?? [],
    };
  });
}

export async function getTourBySlug(slug: string): Promise<Tour | undefined> {
  const { data, error } = await supabase.from('tours').select('*').eq('slug', slug).eq('active', true).maybeSingle();
  if (!error && data) {
    const fallback = tours.find((tour) => tour.slug === slug);
    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      location: data.location ?? fallback?.location ?? '',
      description: data.description ?? fallback?.description ?? '',
      longDescription: data.long_description ?? fallback?.longDescription ?? data.description ?? '',
      image: data.image_url ?? fallback?.image ?? '/images/placeholder-image.jpg',
      price: fallback?.price ?? 0,
      duration: fallback?.duration,
      rating: Number(data.rating ?? fallback?.rating ?? 0),
      category: data.category,
      highlights: Array.isArray(data.highlights) ? data.highlights.filter((item): item is string => typeof item === 'string') : fallback?.highlights ?? [],
      included: Array.isArray(data.included) ? data.included.filter((item): item is string => typeof item === 'string') : fallback?.included ?? [],
    };
  }
  return Promise.resolve(tours.find((tour) => tour.slug === slug));
}
