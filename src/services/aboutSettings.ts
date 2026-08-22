import { supabase } from '../lib/supabase';

export const DEFAULT_ABOUT_SETTINGS = {
  'about.eyebrow.es': 'Sobre nosotros',
  'about.eyebrow.en': 'About us',
  'about.title.es': 'Pasion local y excelencia en el Pacifico de Costa Rica',
  'about.title.en': 'Local passion and excellence on Costa Rica Pacific',
  'about.description.es':
    'Sube a bordo de Second Wind y descubre una experiencia sofisticada donde el lujo se encuentra con la naturaleza.',
  'about.description.en':
    'Step aboard Second Wind and discover a sophisticated ocean experience where luxury meets nature.',
  'about.preview_text.es':
    'Papagayo Fishing Tour es una empresa familiar fundada por los jovenes emprendedores locales Gabriel y Joshua, orgullosamente de Playas del Coco.\n\nCada salida esta disenada con cuidado para ofrecer exclusividad, comodidad y autenticidad en las aguas de la Peninsula de Papagayo.',
  'about.preview_text.en':
    'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco.\n\nEvery journey is thoughtfully designed to deliver exclusivity, comfort and authenticity across the waters of the Papagayo Peninsula.',
  'about.story.es':
    'Papagayo Fishing Tour es una empresa familiar fundada por los jovenes emprendedores locales Gabriel y Joshua, orgullosamente de Playas del Coco. Su conexion profunda con el oceano redefine las experiencias de pesca en las aguas de la Peninsula de Papagayo.\n\nNavega por mares cristalinos reconocidos por pesca, surf y snorkeling de clase mundial. Cada viaje esta disenado para ofrecer exclusividad, comodidad y autenticidad.',
  'about.story.en':
    'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco. Driven by a deep connection to the ocean, they have redefined fishing experiences in the waters of the Papagayo Peninsula.\n\nSail across crystal-clear seas renowned for world-class fishing, surfing and snorkeling. Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity.',
  'about.cta_title.es': 'Listo para planear tu salida?',
  'about.cta_title.en': 'Ready to plan your trip?',
  'about.cta_text.es':
    'Elige tu barco, horario y tipo de experiencia. Nosotros nos encargamos del resto.',
  'about.cta_text.en':
    'Choose your boat, time and experience. We handle the rest.',
  'about.preview_button_label.es': 'Conocer la empresa',
  'about.preview_button_label.en': 'Meet the company',
  'about.cta_button_label.es': 'Reservar ahora',
  'about.cta_button_label.en': 'Book now',
  'about.image_alt.es': 'Tripulacion con pesca en aguas de Guanacaste',
  'about.image_alt.en': 'Crew with a catch in Guanacaste waters',
  'about.image': '',
};

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
    (settings, row) => ({ ...settings, [row.key]: row.value || settings[row.key as keyof AboutSettings] }),
    { ...DEFAULT_ABOUT_SETTINGS },
  );
}
