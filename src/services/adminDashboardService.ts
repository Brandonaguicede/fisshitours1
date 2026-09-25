import { supabase } from '../lib/supabase';
import { computeDashboardKpis, loadAllPages, type DashboardBookingRow, type DashboardKpis } from '../utils/dashboardMetrics';
import { readWithAdminSession } from './adminAuthService';

export type DashboardReservation = {
  id: string;
  booking_reference: string;
  tour_date: string;
  payment_status: string;
  payment_method_key: string;
  booking_status: string;
  total_snapshot: number;
  customers: { full_name: string; whatsapp: string } | null;
  tours: { title: string } | null;
};

const db = supabase as any;

/**
 * One scan of `bookings` feeds five of the six KPIs (total, pending payments, revenue, confirmed payments, to-confirm),
 * so the cards never disagree with each other. `payments` is embedded (one join, no per-booking request) and filtered
 * to `paid` rows only; bookings without one still come back (left join) and fall back to `total_snapshot`.
 */
export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const rows = await loadAllPages<DashboardBookingRow>(async (from, to) => (await readWithAdminSession(() => db
    .from('bookings')
    .select('id, payment_status, booking_status, payment_method_key, total_snapshot, payments(amount, status)')
    .eq('payments.status', 'paid')
    .order('id')
    .range(from, to))) as DashboardBookingRow[] | null);
  return computeDashboardKpis(rows);
}

/** Only the rows the "Reservas recientes" table shows - not the whole bookings table. */
export async function fetchRecentReservations(limit = 8): Promise<DashboardReservation[]> {
  const data = await readWithAdminSession(() => db
    .from('bookings')
    .select('id, booking_reference, tour_date, payment_status, payment_method_key, booking_status, total_snapshot, customers(full_name, whatsapp), tours(title)')
    .order('created_at', { ascending: false })
    .limit(limit));
  return (data ?? []) as DashboardReservation[];
}

/** Comentarios por revisar: `reviews.status = 'pending'`, the same filter the Comentarios page offers. Exact count, no rows transferred. */
export async function fetchPendingReviewsCount(): Promise<number> {
  const { count, error } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw new Error(error.message);
  if (typeof count !== 'number') throw new Error('No se pudo contar los comentarios pendientes.');
  return count;
}
