// Dashboard KPIs: the single place that says what each card counts. Pure - no I/O, no React - so the rules can be
// tested without a browser. Nothing here changes booking, payment, availability or pricing logic; it only reads the
// statuses those flows already write (bookings.payment_status / bookings.booking_status / payments).

export interface DashboardBookingRow {
  id: string;
  payment_status: string;
  booking_status: string;
  payment_method_key: string;
  total_snapshot: number | string | null;
  /** Only the `paid` payment rows are requested; other statuses are ignored here anyway. */
  payments?: Array<{ amount: number | string | null; status: string }> | null;
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

/** Computes every KPI from one pass over the bookings. Rows repeated across pages (same id) count once. */
export function computeDashboardKpis(rows: DashboardBookingRow[]): DashboardKpis {
  const seen = new Set<string>();
  let totalReservations = 0;
  let pendingPayments = 0;
  let confirmedPayments = 0;
  let reservationsToConfirm = 0;
  let revenueCents = 0;

  for (const row of rows) {
    if (row.id != null) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
    }
    totalReservations += 1;
    if (PENDING_PAYMENT_STATUSES.includes(row.payment_status)) pendingPayments += 1;
    if (row.payment_status === CONFIRMED_PAYMENT_STATUS) {
      confirmedPayments += 1;
      revenueCents += collectedCents(row);
    }
    if (isAwaitingAdminConfirmation(row)) reservationsToConfirm += 1;
  }

  return { totalReservations, pendingPayments, revenue: revenueCents / 100, confirmedPayments, reservationsToConfirm };
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
