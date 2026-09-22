import type { Language } from './LanguageContext';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

type TourText = {
  title: string;
  category: string;
  tags: string[];
  duration?: string;
  activities: string[];
  included: string[];
};

// Picks the requested language's text, falling back to whichever side
// actually has content — the site must never show an empty field just
// because "Traducir todo el sitio" hasn't run yet or a DeepL call failed.
function pick(language: Language, es: string | null | undefined, en: string | null | undefined): string {
  const esText = (es ?? '').trim();
  const enText = (en ?? '').trim();
  if (language === 'en') return enText || esText;
  return esText || enText;
}

function pickArray(language: Language, es: string[] | null | undefined, en: string[] | null | undefined): string[] {
  const esArr = Array.isArray(es) ? es.filter((item) => typeof item === 'string' && item.trim()) : [];
  const enArr = Array.isArray(en) ? en.filter((item) => typeof item === 'string' && item.trim()) : [];
  if (language === 'en') return enArr.length > 0 ? enArr : esArr;
  return esArr.length > 0 ? esArr : enArr;
}

export function getTourGroupKey(tour: BoatTour) {
  if (tour.category === 'Bioluminescence Basic' || tour.category === 'Bioluminescence Deluxe') return 'Bioluminescence';
  return tour.category;
}

// Reads the tour/package's own admin-entered content (title, activities,
// included) translated per language, with the same-language fallback from
// pick()/pickArray() above. This used to fall back to a hardcoded, five-
// category dictionary whenever a tour had real data — meaning any tour with
// admin-authored content bypassed translation entirely and showed raw
// Spanish to English visitors. Now that title_en/highlights_en/included_en
// exist in the database (filled by "Traducir todo el sitio"), that
// dictionary is gone; a tour with no content at all just shows its
// category name, in the site's static i18n (translated elsewhere), not a
// per-tour dictionary.
export function getTourText(tour: BoatTour, language: Language): TourText {
  // tourTitle is always set by catalogMappers' mapBoatTour (the only real
  // data source); this fallback only matters for a BoatTour built by hand
  // without it, same as the pre-existing behavior.
  const fallbackTitle = tour.tourTitle ?? tour.name.replace(/\s+-\s+.*$/, '');
  const title = pick(language, fallbackTitle, tour.tourTitleEn).replace(/\s+Tour$/i, '');
  const activities = pickArray(language, tour.activities, tour.activitiesEn);
  const included = pickArray(language, tour.included, tour.includedEn);

  return {
    title,
    category: tour.category,
    tags: activities.length > 0 ? activities : [tour.category],
    duration: tour.duration ? `${tour.duration} ${language === 'es' ? 'horas' : 'hours'}` : undefined,
    activities: activities.length > 0 ? activities : [tour.category],
    included,
  };
}

export function getBoatText(boat: Boat, language: Language) {
  return {
    badge: pick(language, boat.badge, boat.badgeEn),
    // A physical spec ("32 pies" / "32ft"), not prose — shown as-is in both
    // languages, same as engine/length elsewhere. Previously this hardcoded
    // one specific boat's Spanish description for every boat in the fleet
    // and showed the raw (Spanish) DB value to English visitors; both are
    // fixed by just rendering the real field directly.
    length: boat.length,
    featuredSpec: pick(language, boat.featuredSpec, boat.featuredSpecEn),
  };
}

export function getPackageLabel(tour: BoatTour, language: Language) {
  const label = tour.name.replace(/^.* - /, '');
  if (language === 'es') {
    return label
      .replace('Half Day', 'Medio dia')
      .replace('Three-Quarter Day', 'Tres cuartos de dia')
      .replace('Full Day', 'Dia completo')
      .replace('Classic Experience', 'Experiencia Classic')
      .replace('Deluxe Experience', 'Experiencia Deluxe');
  }
  return label;
}
