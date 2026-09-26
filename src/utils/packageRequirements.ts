/**
 * What a tour package must have to be safely BOOKABLE online — derived from its real consumers, not from column names:
 *
 *  - get-booking-availability (Edge): rejects the package (HTTP 400) unless `duration_minutes` is an integer > 0, and only offers the
 *    departures the package allows; the overlap / operating-hours guards in the database also need the duration (without it they
 *    silently skip the check, so a package with no duration could be double-booked).
 *  - calculate-booking-price (Edge) and the booking form: base price, included guests (the form starts at that number and the price query
 *    needs guests > 0), extra guest price and max guests (capacity ceiling) drive the total.
 *  - the public catalog (`isBookableCatalogPackage`): a priced package and at least one departure time.
 *  - the database itself: name, max_guests > 0 and max_guests >= included_guests are NOT NULL / CHECK constraints.
 *
 * A) Required to work (non custom-quote): name, duration, at least one departure time, price > 0, included guests >= 1,
 *    max guests >= included guests (and >= 1), extra guest price >= 0 (0 is fine).
 * B) Required only to be visible/active: the whole list above. A package that misses any of it may be kept, but ONLY inactive.
 * C) Optional, with a defined fallback: description (falls back to the tour's), meal options ([] = no meals), "Incluye"
 *    (null = inherits the tour's list), image (falls back to the tour's), extra guest price = 0.
 * D) Derived / technical, never typed by the admin: id, package_type, boat_tour_id, sort_order, translations, timestamps.
 *
 * "Custom quote" packages are not bookable online at all (they are quoted by contact), so duration / schedule / price do not apply to them.
 * Departure times: `null` means "use the shared schedule" (needs at least one active shared time); an array is the package's own list.
 */
export type PackageIssue = 'name' | 'duration' | 'schedule' | 'price' | 'includedGuests' | 'maxGuests' | 'extraGuestPrice';

export interface PackageFacts {
  name: string | null | undefined;
  customQuote: boolean;
  basePrice: number | null | undefined;
  includedGuests: number | null | undefined;
  maxGuests: number | null | undefined;
  extraGuestPrice: number | null | undefined;
  durationMinutes: number | null | undefined;
  /** `null` = inherits the shared schedule. */
  departureTimes: string[] | null | undefined;
  /** Active shared time slots (only relevant when `departureTimes` is null). */
  sharedTimeCount: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

export function findPackageIssues(facts: PackageFacts): PackageIssue[] {
  const issues: PackageIssue[] = [];
  if (!facts.name || !facts.name.trim()) issues.push('name');
  const max = facts.maxGuests;
  const included = facts.includedGuests;
  if (!isPositiveInteger(max) || (typeof included === 'number' && Number.isFinite(included) && max < included)) issues.push('maxGuests');
  if (facts.customQuote) return issues;
  if (!isPositiveInteger(facts.durationMinutes)) issues.push('duration');
  const times = facts.departureTimes;
  if (times == null ? !(facts.sharedTimeCount > 0) : times.length === 0 || times.some((time) => !TIME.test(time))) issues.push('schedule');
  if (typeof facts.basePrice !== 'number' || !Number.isFinite(facts.basePrice) || facts.basePrice <= 0) issues.push('price');
  if (!isPositiveInteger(included)) issues.push('includedGuests');
  if (typeof facts.extraGuestPrice !== 'number' || !Number.isFinite(facts.extraGuestPrice) || facts.extraGuestPrice < 0) issues.push('extraGuestPrice');
  return issues;
}

export const isPackageReady = (facts: PackageFacts) => findPackageIssues(facts).length === 0;

/** Short, admin-facing (Spanish) wording — never a column name. */
export const PACKAGE_ISSUE_LABELS: Record<PackageIssue, string> = {
  name: 'el nombre',
  duration: 'la duración',
  schedule: 'al menos un horario de salida',
  price: 'un precio mayor a 0',
  includedGuests: 'las personas incluidas',
  maxGuests: 'un máximo de personas válido',
  extraGuestPrice: 'un cargo extra válido',
};

export function describePackageIssues(issues: PackageIssue[]) {
  return issues.map((issue) => PACKAGE_ISSUE_LABELS[issue]).join(', ');
}

/** Thrown by the package write paths when someone tries to save / activate a package that could not be booked. */
export class PackageIncompleteError extends Error {
  constructor(readonly packageId: string, readonly issues: PackageIssue[]) {
    super(`Este paquete está incompleto. Falta: ${describePackageIssues(issues)}. Complétalo o déjalo oculto.`);
    this.name = 'PackageIncompleteError';
  }
}
