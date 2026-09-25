// Dashboard metrics: the single place that says what each card and chart counts. Pure - no I/O, no React - so the
// rules can be tested without a browser. Nothing here changes booking, payment, availability or pricing logic; it only
// reads the statuses those flows already write (bookings.payment_status / bookings.booking_status / payments).
//
// The Dashboard reads `bookings` ONCE (see adminDashboardService.fetchDashboardOverview) and this file turns that one
// row set into everything the page shows: the KPI cards, the four analytics and the five most recent reservations.

import { formatPaymentMethodLabel } from './reservationsExport';

export interface DashboardBookingRow {
  id: string;
  payment_status: string;
  booking_status: string;
  payment_method_key: string;
  total_snapshot: number | string | null;
  /** Only the `paid` payment rows are requested; other statuses are ignored here anyway. */
  payments?: Array<{ amount: number | string | null; status: string }> | null;
}

/** A booking row of the overview scan: the KPI fields plus what the analytics and "Reservas recientes" need. */
export interface DashboardOverviewRow extends DashboardBookingRow {
  created_at: string;
  tour_date: string;
  boat_id: string;
  tour_id: string;
  customers?: { full_name: string | null } | null;
  boats?: { name: string | null } | null;
  tours?: { title: string | null } | null;
  payment_methods?: { name: string | null } | null;
}

export interface DashboardKpis {
  totalReservations: number;
  pendingPayments: number;
  /** Money actually collected, in USD. */
  revenue: number;
  confirmedPayments: number;
  reservationsToConfirm: number;
}

/**
 * Pagos pendientes: `bookings.payment_status` is `pending` (payment requested, nothing received: PayPal not yet
 * captured, WhatsApp link, transfer) or `processing` (PayPal order created, capture in flight).
 * Excluded: `not_required_yet` (pay-on-tour: nothing is due yet), `failed` and `refunded` (also what cancelled/expired
 * unpaid bookings are moved to), and `paid`.
 */
export const PENDING_PAYMENT_STATUSES = ['pending', 'processing'];

/** Pagos confirmados and Ingresos both start from `bookings.payment_status = 'paid'`. Refunded bookings are not `paid`. */
export const CONFIRMED_PAYMENT_STATUS = 'paid';

/**
 * Reservas por confirmar: bookings whose `booking_status` is still open - `pending` (legacy, still allowed by the
 * check constraint), `pending_payment` or `pending_confirmation`. `confirmed`, `cancelled` and `completed` are out.
 * Same open set the Reservas cards call "Pendientes" (PENDING_BOOKING_STATUSES in reservationsExport).
 */
export const OPEN_BOOKING_STATUSES = ['pending', 'pending_payment', 'pending_confirmation'];

/** A PayPal booking can only be confirmed by an admin once PayPal has actually paid it (mirrors the Reservas "Confirmar" button). */
export function isAwaitingAdminConfirmation(row: Pick<DashboardBookingRow, 'booking_status' | 'payment_method_key' | 'payment_status'>): boolean {
  if (!OPEN_BOOKING_STATUSES.includes(row.booking_status)) return false;
  return !(row.payment_method_key === 'paypal' && row.payment_status !== CONFIRMED_PAYMENT_STATUS);
}

const toCents = (value: number | string | null | undefined) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

/**
 * Cash collected for one booking, in cents. Only meaningful for `payment_status = 'paid'` rows.
 * - If the booking has `payments` rows with status `paid` (PayPal captures), their amounts are what was really charged
 *   (the booking total can be edited by an admin after payment; the capture cannot).
 * - Otherwise the payment was confirmed by an admin (WhatsApp / transfer / cash, which never write a `payments` row),
 *   and the booking's `total_snapshot` is the only recorded amount.
 */
export function collectedCents(row: DashboardBookingRow): number {
  const paidPayments = (row.payments ?? []).filter((payment) => payment.status === 'paid');
  if (paidPayments.length > 0) return paidPayments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  return toCents(row.total_snapshot);
}

/** Rows repeated across pages (same id) count once. Rows without an id are kept as they are. */
export function dedupeRows<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const row of rows) {
    if (row.id != null) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
    }
    unique.push(row);
  }
  return unique;
}

function kpisOfUniqueRows(rows: DashboardBookingRow[]): DashboardKpis {
  let pendingPayments = 0;
  let confirmedPayments = 0;
  let reservationsToConfirm = 0;
  let revenueCents = 0;

  for (const row of rows) {
    if (PENDING_PAYMENT_STATUSES.includes(row.payment_status)) pendingPayments += 1;
    if (row.payment_status === CONFIRMED_PAYMENT_STATUS) {
      confirmedPayments += 1;
      revenueCents += collectedCents(row);
    }
    if (isAwaitingAdminConfirmation(row)) reservationsToConfirm += 1;
  }

  return { totalReservations: rows.length, pendingPayments, revenue: revenueCents / 100, confirmedPayments, reservationsToConfirm };
}

/** Computes every KPI from one pass over the bookings. Rows repeated across pages (same id) count once. */
export function computeDashboardKpis(rows: DashboardBookingRow[]): DashboardKpis {
  return kpisOfUniqueRows(dedupeRows(rows));
}

// ---- analytics --------------------------------------------------------------------------------------------------

/** Every analytic covers the last 12 calendar weeks, the current one included. */
export const ANALYTICS_WEEKS = 12;

/**
 * Weeks are calendar weeks (Monday to Sunday) of the business' own clock, Costa Rica: UTC-6 all year (no DST), so the
 * result does not depend on the browser the admin happens to use. `bookings.created_at` (timestamptz) decides the week.
 */
export const BUSINESS_UTC_OFFSET_HOURS = -6;

/**
 * Period and criterion of Demanda por bote, Demanda por tour, Reservas por semana and Método de pago:
 * a booking counts when it was CREATED (`bookings.created_at`) inside the period and its `booking_status` is not
 * `cancelled`. Cancelled bookings are demand that did not happen, so they are excluded from every analytic
 * (they still count in the KPI cards: Reservas totales is every booking, whatever its status).
 */
export const ANALYTICS_EXCLUDED_BOOKING_STATUS = 'cancelled';
export const ANALYTICS_CRITERION_TEXT = 'Cuenta las reservas creadas en el período, sin las canceladas.';

/** Shown by every analytic that has nothing to draw. */
export const EMPTY_TREND_MESSAGE = 'Aún no hay suficientes reservas para mostrar esta tendencia.';

/** Demand charts show this many rows; the rest is added up in a last "Otros (n)" row. */
export const DEMAND_TOP_LIMIT = 6;

export interface DashboardWeek {
  /** Monday, `YYYY-MM-DD`. */
  start: string;
  /** Sunday, `YYYY-MM-DD`. */
  end: string;
  count: number;
}

export interface DashboardDemandItem {
  id: string;
  label: string;
  count: number;
}

export interface DashboardMethodItem extends DashboardDemandItem {
  /** Share of the counted bookings, 0-100, rounded to the nearest integer. */
  percent: number;
}

export interface DashboardMostUsedMethod {
  /** More than one label when the top count is tied. */
  labels: string[];
  count: number;
  percent: number;
}

export interface DashboardAnalytics {
  period: { weeks: number; start: string; end: string };
  /** Bookings created inside the period that are not cancelled: the population every analytic is built from. */
  total: number;
  demandByBoat: DashboardDemandItem[];
  demandByTour: DashboardDemandItem[];
  /** Always `ANALYTICS_WEEKS` entries, oldest first; weeks without bookings are kept with `count: 0`. */
  weeklyBookings: DashboardWeek[];
  paymentMethods: DashboardMethodItem[];
  mostUsedPaymentMethod: DashboardMostUsedMethod | null;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const OFFSET_MS = BUSINESS_UTC_OFFSET_HOURS * 3_600_000;

const isoDay = (shiftedMs: number) => new Date(shiftedMs).toISOString().slice(0, 10);

/** Monday 00:00 of the week that contains `now`, on the business clock (a UTC timestamp of the offset-shifted clock). */
function currentWeekStartShifted(now: Date): number {
  const day = Math.floor((now.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS;
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return day - sinceMonday * DAY_MS;
}

const byCountThenLabel = (a: DashboardDemandItem, b: DashboardDemandItem) =>
  b.count - a.count || a.label.localeCompare(b.label, 'es') || a.id.localeCompare(b.id);

function rankedDemand(counts: Map<string, DashboardDemandItem>, limit = DEMAND_TOP_LIMIT): DashboardDemandItem[] {
  const ranked = [...counts.values()].sort(byCountThenLabel);
  if (ranked.length <= limit) return ranked;
  const rest = ranked.slice(limit);
  return [...ranked.slice(0, limit), { id: '__others', label: `Otros (${rest.length})`, count: rest.reduce((sum, item) => sum + item.count, 0) }];
}

function tally(counts: Map<string, DashboardDemandItem>, id: string, label: string) {
  const item = counts.get(id);
  if (item) item.count += 1;
  else counts.set(id, { id, label, count: 1 });
}

/**
 * The four analytics in one pass over the (already de-duplicated) rows. Nothing is invented: a booking whose
 * `created_at` is missing/invalid or falls outside the 12 weeks is simply not counted, and names that did not come
 * back from the join fall back to the id / payment-method key the booking really holds.
 */
export function computeDashboardAnalytics(rows: DashboardOverviewRow[], now: Date = new Date()): DashboardAnalytics {
  const lastWeekStart = currentWeekStartShifted(now);
  const firstWeekStart = lastWeekStart - (ANALYTICS_WEEKS - 1) * WEEK_MS;
  const weeklyCounts = new Array<number>(ANALYTICS_WEEKS).fill(0);
  const boats = new Map<string, DashboardDemandItem>();
  const tours = new Map<string, DashboardDemandItem>();
  const methods = new Map<string, DashboardDemandItem>();
  let total = 0;

  for (const row of rows) {
    if (row.booking_status === ANALYTICS_EXCLUDED_BOOKING_STATUS) continue;
    const created = Date.parse(row.created_at);
    if (!Number.isFinite(created)) continue;
    const week = Math.floor((created + OFFSET_MS - firstWeekStart) / WEEK_MS);
    if (week < 0 || week >= ANALYTICS_WEEKS) continue;
    total += 1;
    weeklyCounts[week] += 1;
    tally(boats, row.boat_id, row.boats?.name || row.boat_id);
    tally(tours, row.tour_id, row.tours?.title || row.tour_id);
    tally(methods, row.payment_method_key, formatPaymentMethodLabel(row.payment_method_key, row.payment_methods?.name || row.payment_method_key));
  }

  const paymentMethods = [...methods.values()].sort(byCountThenLabel).map((item) => ({ ...item, percent: Math.round((item.count / total) * 100) }));
  const top = paymentMethods[0];
  const tied = top ? paymentMethods.filter((item) => item.count === top.count) : [];

  return {
    period: { weeks: ANALYTICS_WEEKS, start: isoDay(firstWeekStart), end: isoDay(lastWeekStart + 6 * DAY_MS) },
    total,
    demandByBoat: rankedDemand(boats),
    demandByTour: rankedDemand(tours),
    weeklyBookings: weeklyCounts.map((count, index) => {
      const start = firstWeekStart + index * WEEK_MS;
      return { start: isoDay(start), end: isoDay(start + 6 * DAY_MS), count };
    }),
    paymentMethods,
    mostUsedPaymentMethod: top ? { labels: tied.map((item) => item.label), count: top.count, percent: top.percent } : null,
  };
}

// ---- recent reservations ----------------------------------------------------------------------------------------

/** "Reservas recientes" always shows exactly the latest five bookings. */
export const RECENT_RESERVATIONS_LIMIT = 5;

export interface DashboardRecentReservation {
  id: string;
  customerName: string | null;
  tourDate: string;
  paymentStatus: string;
}

/** Newest first by `created_at`; ties (same instant) fall back to the larger id so the order is deterministic. */
export function selectRecentReservations(rows: DashboardOverviewRow[], limit = RECENT_RESERVATIONS_LIMIT): DashboardRecentReservation[] {
  const time = (row: DashboardOverviewRow) => {
    const value = Date.parse(row.created_at);
    return Number.isFinite(value) ? value : -Infinity;
  };
  return [...rows]
    .sort((a, b) => (time(b) === time(a) ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : time(b) - time(a)))
    .slice(0, limit)
    .map((row) => ({ id: row.id, customerName: row.customers?.full_name ?? null, tourDate: row.tour_date, paymentStatus: row.payment_status }));
}

// ---- overview ---------------------------------------------------------------------------------------------------

export interface DashboardOverview {
  kpis: DashboardKpis;
  analytics: DashboardAnalytics;
  recentReservations: DashboardRecentReservation[];
}

/** Everything the Dashboard shows from ONE scan of `bookings`: rows are de-duplicated once and shared by all three views. */
export function buildDashboardOverview(rows: DashboardOverviewRow[], now: Date = new Date()): DashboardOverview {
  const unique = dedupeRows(rows);
  return { kpis: kpisOfUniqueRows(unique), analytics: computeDashboardAnalytics(unique, now), recentReservations: selectRecentReservations(unique) };
}

/**
 * Reads every page of a query. PostgREST silently caps a plain select at 1000 rows (`max_rows`), which would
 * under-count the KPIs once the business has more bookings than that.
 */
export async function loadAllPages<T>(loadRange: (from: number, to: number) => Promise<T[] | null>, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 1_000_000; from += size) {
    const batch = (await loadRange(from, from + size - 1)) ?? [];
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return rows;
}
