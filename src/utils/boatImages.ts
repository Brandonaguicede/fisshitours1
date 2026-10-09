// A boat's gallery has ONE order, and its cover is simply the first photo of that order. There is no second "cover" concept to keep in step:
// the public site, the Admin gallery and the denormalised boats.* columns all read the cover through these helpers.
// (boat_images.is_primary still exists, but it is derived from this order by a database trigger — nothing reads it to decide the cover.)

export interface OrderedBoatImage {
  id?: string;
  sort_order: number;
  created_at?: string | null;
}

/** Gallery order: position first, then creation time and id so two rows with the same position still have a stable, repeatable order. */
export function orderBoatImages<T extends OrderedBoatImage>(images: readonly T[]): T[] {
  return [...images].sort((a, b) => (
    a.sort_order - b.sort_order
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    || String(a.id ?? '').localeCompare(String(b.id ?? ''))
  ));
}

/** The cover is the first image of the gallery (Foto 1). */
export function boatCover<T extends OrderedBoatImage>(images: readonly T[]): T | undefined {
  return orderBoatImages(images)[0];
}
