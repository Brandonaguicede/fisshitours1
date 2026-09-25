// Departure locations are ordered by `sort_order` and position 1 is the default choice. The legacy `is_default`
// column is still in the schema but is no longer a product decision: nothing here reads it.

interface OrderedLocation {
  id: string;
  name: string;
  sort_order: number;
}

/** Position order: `sort_order` ascending, then name, then id so ties (e.g. legacy rows all at 0) stay deterministic. */
export function sortDepartureLocations<T extends OrderedLocation>(locations: readonly T[]): T[] {
  return [...locations].sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Position 1 (first by `sort_order`) is the default; `undefined` when there is nothing to choose. */
export function getDefaultDepartureLocation<T extends OrderedLocation>(locations: readonly T[]): T | undefined {
  return sortDepartureLocations(locations)[0];
}

/** Writes needed to make persisted `sort_order` contiguous 1..N in the current position order (only rows that differ). */
export function normalizeDepartureLocationOrder<T extends OrderedLocation>(locations: readonly T[]): Array<{ id: string; sort_order: number }> {
  return sortDepartureLocations(locations)
    .map((location, index) => ({ id: location.id, sort_order: index + 1, current: Number(location.sort_order) }))
    .filter((item) => item.current !== item.sort_order)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}
