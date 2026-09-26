import { supabase } from '../lib/supabase';
import { buildDashboardOverview, loadAllPages, type DashboardOverview, type DashboardOverviewRow } from '../utils/dashboardMetrics';
import { readWithAdminSession } from './adminAuthService';

const db = supabase as any;

/**
 * The Dashboard's one scan of `bookings`. KPI cards, the four analytics and "Reservas recientes" are all derived from
 * these rows (see buildDashboardOverview), so the page never disagrees with itself and never fetches twice.
 *
 * - One relational query per 1000-row page (PostgREST `max_rows`): `customers`, `boats`, `tours`, `payment_methods`
 *   and `payments` are embedded joins, so there is no per-booking request (no N+1).
 * - `payments` is filtered to `paid` rows only; bookings without one still come back (left join) and fall back to
 *   `total_snapshot` for revenue.
 * - Ordered by `id` (primary key) so offset pages are stable; the "latest five" are sorted by `created_at` in memory.
 */
export const DASHBOARD_OVERVIEW_SELECT = 'id, created_at, tour_date, boat_id, tour_id, payment_status, booking_status, payment_method_key, total_snapshot, customers(full_name), boats(name), tours(title), payment_methods(name), payments(amount, status)';

export async function fetchDashboardOverview(now: Date = new Date()): Promise<DashboardOverview> {
  const rows = await loadAllPages<DashboardOverviewRow>(async (from, to) => (await readWithAdminSession(() => db
    .from('bookings')
    .select(DASHBOARD_OVERVIEW_SELECT)
    .eq('payments.status', 'paid')
    .order('id')
    .range(from, to))) as DashboardOverviewRow[] | null);
  return buildDashboardOverview(rows, now);
}

/** Comentarios por revisar: `reviews.status = 'pending'`, the same filter the Comentarios page offers. Exact count, no rows transferred. */
export async function fetchPendingReviewsCount(): Promise<number> {
  const { count, error } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw new Error(error.message);
  if (typeof count !== 'number') throw new Error('No se pudo contar los comentarios pendientes.');
  return count;
}
