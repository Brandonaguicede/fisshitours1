// The contact of a booking = the name / email / WhatsApp used for THAT reservation (bookings.customer_*_snapshot), never the current
// profile of the customer: a later booking by the same person must not change what an earlier one shows or where its emails go.
//
// Legacy fallback: a booking row without a snapshot (created by the previous version of create_booking_transaction, before the snapshots
// existed) falls back to its customer row. The name is always written for a snapshotted booking, so "name is null" is what identifies a
// legacy row; for a snapshotted booking a null email is a real "no email" (manual booking, or an email the Admin removed) and is NOT
// replaced by the customer's email.

export const BOOKING_CONTACT_COLUMNS = 'customer_name_snapshot, customer_email_snapshot, customer_whatsapp_snapshot';

/** Supabase types a to-one embed as an array when no generated types are used; at runtime it is a single row. */
function firstRow(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function getBookingContact(booking) {
  if (booking?.customer_name_snapshot != null) {
    return {
      fullName: booking.customer_name_snapshot,
      email: booking.customer_email_snapshot ?? null,
      whatsapp: booking.customer_whatsapp_snapshot ?? null,
    };
  }
  const customer = firstRow(booking?.customers);
  return { fullName: customer?.full_name ?? '', email: customer?.email ?? null, whatsapp: customer?.whatsapp ?? null };
}
