import { supabase } from '../lib/supabase';

export const DEFAULT_ABOUT_SETTINGS = {
  'about.eyebrow.es': 'Sobre nosotros',
  'about.eyebrow.en': 'About us',
  'about.title.es': 'Pasión local y excelencia en el Pacífico de Costa Rica',
  'about.title.en': "Local passion and excellence on Costa Rica's Pacific coast",
  'about.preview_text.es':
    'Papagayo Fishing Tour es una empresa familiar fundada por Gabriel y Joshua, jóvenes emprendedores de Playas del Coco con una conexión profunda con el mar y la Península de Papagayo.\n\nCada experiencia combina conocimiento local, tripulación profesional y tours privados diseñados para pesca deportiva, snorkeling, playa y recorridos personalizados.',
  'about.preview_text.en':
    'Papagayo Fishing Tour is a family-run company founded by Gabriel and Joshua, young entrepreneurs from Playas del Coco with a deep connection to the sea and the Papagayo Peninsula.\n\nEvery experience blends local knowledge, a professional crew and private tours designed for sport fishing, snorkeling, beach days and fully personalized itineraries.',
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
