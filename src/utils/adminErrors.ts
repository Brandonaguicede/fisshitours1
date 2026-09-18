// Shared across every Admin delete handler (Tours, Boats, Destinos, etc.):
// a foreign-key violation from Postgres (SQLSTATE 23503, whether raised by
// the FK itself or by a custom trigger like
// prevent_departure_location_delete_with_bookings) must never reach the user
// as raw Postgres text — no constraint name, no "violates foreign key
// constraint", no stack trace. This turns it into one consistent, readable
// sentence instead of appending the raw message like earlier per-page code
// used to.
export function friendlyDeleteError(error: { code?: string; message: string }, entityLabel: string): string {
  const isForeignKeyViolation = error.code === '23503' || /foreign key|violates .* constraint|is still referenced/i.test(error.message);
  if (isForeignKeyViolation) {
    return `No se puede eliminar ${entityLabel} porque tiene reservas u otra información asociada. Desactívalo en lugar de eliminarlo.`;
  }
  return `No se pudo eliminar ${entityLabel}. Intenta de nuevo.`;
}
