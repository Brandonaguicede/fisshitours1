import { supabase } from '../lib/supabase';

export const ABOUT_CAROUSEL_DEFAULTS = {
  'about.carousel_1.image': '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg',
  'about.carousel_2.image': '/about/IMG_1020 (1).jpeg',
  'about.carousel_3.image': '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg',
  'about.carousel_4.image': '/galeria/IMG_9407.jpeg',
};

export function buildAboutCarouselImages(settings: Record<string, string>): string[] {
  return Array.from(new Set([...Object.entries(ABOUT_CAROUSEL_DEFAULTS)
    .map(([key, fallback]) => (settings[key] ?? fallback).trim()), settings['about.image']?.trim()].filter((url): url is string => Boolean(url))));
}

export const DEFAULT_ABOUT_SETTINGS = {
  ...ABOUT_CAROUSEL_DEFAULTS,
  'about.eyebrow.es': 'Sobre nosotros',
  'about.eyebrow.en': 'About us',
  'about.title.es': 'Pasión local y excelencia en el Pacífico de Costa Rica',
  'about.title.en': "Local passion and excellence on Costa Rica's Pacific coast",
  // Short tagline under the title — previously edited in the Admin but with
  // nowhere on the public site to appear.
  'about.description.es': 'Sube a bordo de Second Wind y descubre una experiencia sofisticada donde el lujo se encuentra con la naturaleza.',
  'about.description.en': 'Step aboard Second Wind and discover a sophisticated ocean experience where luxury meets nature.',
  'about.preview_text.es':
    'Papagayo Fishing Tour es una empresa familiar fundada por Gabriel y Joshua, jóvenes emprendedores de Playas del Coco con una conexión profunda con el mar y la Península de Papagayo.\n\nCada experiencia combina conocimiento local, tripulación profesional y tours privados diseñados para pesca deportiva, snorkeling, playa y recorridos personalizados.',
  'about.preview_text.en':
    'Papagayo Fishing Tour is a family-run company founded by Gabriel and Joshua, young entrepreneurs from Playas del Coco with a deep connection to the sea and the Papagayo Peninsula.\n\nEvery experience blends local knowledge, a professional crew and private tours designed for sport fishing, snorkeling, beach days and fully personalized itineraries.',
  // Longer narrative — shown behind a "Leer nuestra historia" toggle so the
  // teaser card doesn't grow by default.
  'about.story.es':
    'Papagayo Fishing Tour es una empresa familiar fundada por los jóvenes emprendedores locales Gabriel y Joshua, orgullosamente de Playas del Coco. Su conexión profunda con el océano redefine las experiencias de pesca en las aguas de la Península de Papagayo.\n\nNavega por mares cristalinos reconocidos por pesca, surf y snorkeling de clase mundial. Cada viaje está diseñado para ofrecer exclusividad, comodidad y autenticidad.',
  'about.story.en':
    'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco. Driven by a deep connection to the ocean, they have redefined fishing experiences in the waters of the Papagayo Peninsula.\n\nSail across crystal-clear seas renowned for world-class fishing, surfing and snorkeling. Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity.',
  'about.image_alt.es': 'Tripulacion con pesca en aguas de Guanacaste',
  'about.image_alt.en': 'Crew with a catch in Guanacaste waters',
  'about.image': '',
};

// The small contact card under the About section ("Want to talk with us?") is fixed copy, not editable content: it lives here
// (not in site_settings) so the Admin has nothing to edit and the public page always shows exactly these texts.
export const ABOUT_CONTACT_CTA = {
  es: { title: '¿Quieres hablar con nosotros?', text: 'Escríbenos y con gusto te ayudamos.' },
  en: { title: 'Want to talk with us?', text: "Send us a message and we'll be happy to help." },
} as const;

export type AboutSettings = typeof DEFAULT_ABOUT_SETTINGS;

export function splitParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function getAboutSettings(): Promise<AboutSettings> {
  const keys = Object.keys(DEFAULT_ABOUT_SETTINGS);
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys)
    .eq('active', true);

  if (error) return DEFAULT_ABOUT_SETTINGS;

  return (data ?? []).reduce<AboutSettings>(
    (settings, row) => ({ ...settings, [row.key]: row.value ?? settings[row.key as keyof AboutSettings] }),
    { ...DEFAULT_ABOUT_SETTINGS },
  );
}
