// Booking attempts ("leads"): what the customer typed in the last booking step, kept even if they leave before paying.
// Pure helpers only (no imports, no React): the checkout builds the payload, the Admin classifies and links from the stored row.

export const LEAD_ABANDONED_AFTER_MINUTES = 60;
const LEAD_TOKEN_STORAGE_KEY = 'booking-lead-token';

export interface BookingLeadContextInput {
  boatId?: string;
  tourId?: string;
  tourPackageId?: string;
  tourDate?: string;
  timeSlotId?: string;
  guests?: number;
}

export interface BookingLeadInput {
  customerName: string;
  customerEmail: string;
  /** The normalized international number (E.164: "+" and the digits, country code included), or '' while it is missing or invalid. */
  customerWhatsapp: string;
  language: 'es' | 'en';
  /** The selection (boat, tour, package) is always shown before the last step. */
  selection: { boatId?: string; tourId?: string; tourPackageId?: string };
  /** Date, time and guests ship with technical defaults (tomorrow, first slot, included guests): they only count once the customer went through the step that shows them. */
  tourDetailsConfirmed: boolean;
  tourDetails: { tourDate?: string; timeSlotId?: string; guests?: number };
}

export interface BookingLeadPayload {
  customer: { fullName: string; email: string; whatsapp: string };
  language: 'es' | 'en';
  context: BookingLeadContextInput;
}

// Same rules the Edge Function (zod) and the database enforce, so the browser never sends something the server would reject.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The WhatsApp of a lead is always international (E.164). The checkout builds it from an explicit country prefix, never from a guess.
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isValidLeadContact(name: string, email: string, whatsapp: string) {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const cleanEmail = email.trim();
  const cleanWhatsapp = whatsapp.trim();
  return cleanName.length >= 2 && cleanName.length <= 120
    && EMAIL_PATTERN.test(cleanEmail) && cleanEmail.length <= 254
    && E164_PATTERN.test(cleanWhatsapp);
}

/** The payload to save, or null while name, email or WhatsApp is missing / invalid (nothing is sent, no garbage lead). */
export function buildBookingLeadPayload(input: BookingLeadInput): BookingLeadPayload | null {
  if (!isValidLeadContact(input.customerName, input.customerEmail, input.customerWhatsapp)) return null;
  const context: BookingLeadContextInput = {};
  if (input.selection.boatId) context.boatId = input.selection.boatId;
  if (input.selection.tourId) context.tourId = input.selection.tourId;
  if (input.selection.tourPackageId) context.tourPackageId = input.selection.tourPackageId;
  if (input.tourDetailsConfirmed) {
    if (input.tourDetails.tourDate) context.tourDate = input.tourDetails.tourDate;
    if (input.tourDetails.timeSlotId) context.timeSlotId = input.tourDetails.timeSlotId;
    if (input.tourDetails.guests && input.tourDetails.guests > 0) context.guests = input.tourDetails.guests;
  }
  return {
    customer: {
      fullName: input.customerName.trim().replace(/\s+/g, ' '),
      email: input.customerEmail.trim().toLowerCase(),
      whatsapp: input.customerWhatsapp.trim(),
    },
    language: input.language,
    context,
  };
}

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Very old browsers: a v4-shaped id from Math.random is enough (the token only has to be unique per session, it is not a credential).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

let memoryToken: string | null = null;

/** One token per browser session (tab). Falls back to memory when storage is blocked. It identifies the attempt, never the person. */
export function getBookingLeadToken() {
  try {
    const stored = sessionStorage.getItem(LEAD_TOKEN_STORAGE_KEY);
    if (stored) return stored;
    const created = memoryToken ?? randomUuid();
    sessionStorage.setItem(LEAD_TOKEN_STORAGE_KEY, created);
    return created;
  } catch {
    memoryToken = memoryToken ?? randomUuid();
    return memoryToken;
  }
}

/** After a booking exists the attempt is over: the next attempt in this tab starts with a fresh token. */
export function resetBookingLeadToken() {
  memoryToken = null;
  try { sessionStorage.removeItem(LEAD_TOKEN_STORAGE_KEY); } catch { /* In-memory only. */ }
}

// ---- Admin side -------------------------------------------------------------------------------------------------

export interface BookingLeadRow {
  id: string;
  status: 'open' | 'converted';
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  language: 'es' | 'en';
  tour_date: string | null;
  guests: number | null;
  boat_name: string | null;
  tour_title: string | null;
  package_name: string | null;
  time_slot_label: string | null;
  booking_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingLeadState = 'in_progress' | 'abandoned' | 'converted';

/** Derived, never stored: an open lead with no activity for 60 minutes is "possibly abandoned". */
export function classifyBookingLead(lead: { status: string; updated_at: string }, now: Date | number = Date.now()): BookingLeadState {
  if (lead.status === 'converted') return 'converted';
  const last = new Date(lead.updated_at).getTime();
  const current = typeof now === 'number' ? now : now.getTime();
  if (!Number.isFinite(last)) return 'in_progress';
  return current - last >= LEAD_ABANDONED_AFTER_MINUTES * 60 * 1000 ? 'abandoned' : 'in_progress';
}

/** mailto: link for the stored email (encoded; no subject/body is invented). Null when the lead has no email. */
export function buildLeadMailtoUrl(email: string | null | undefined) {
  const value = (email ?? '').trim();
  if (!value) return null;
  return `mailto:${encodeURIComponent(value).replace(/%40/g, '@')}`;
}

/**
 * Digits for wa.me: exactly the stored international number without its "+". Nothing is added or guessed (no country code is ever
 * assumed from the length of the number): a stored value that is not E.164 yields no link.
 */
export function normalizeLeadWhatsApp(value: string | null | undefined) {
  const stored = (value ?? '').trim();
  return E164_PATTERN.test(stored) ? stored.slice(1) : '';
}

/** wa.me link to the customer with a short greeting in the language the customer used. Null when the number is unusable. */
export function buildLeadWhatsAppUrl(lead: { whatsapp: string | null; full_name: string | null; tour_title: string | null; language: string }) {
  const number = normalizeLeadWhatsApp(lead.whatsapp);
  if (!number) return null;
  const firstName = (lead.full_name ?? '').trim().split(' ')[0];
  const message = lead.language === 'en'
    ? `Hello${firstName ? ` ${firstName}` : ''}! This is Papagayo Fishing Tours. We saw you were interested in booking${lead.tour_title ? ` "${lead.tour_title}"` : ' a tour'}. Can we help you finish your reservation?`
    : `¡Hola${firstName ? ` ${firstName}` : ''}! Somos Papagayo Fishing Tours. Vimos que te interesó reservar${lead.tour_title ? ` "${lead.tour_title}"` : ' un tour'}. ¿Te ayudamos a completar tu reserva?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
