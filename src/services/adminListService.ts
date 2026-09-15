import { supabase } from '../lib/supabase';
import { readWithAdminSession } from './adminAuthService';
import type { AdminPageResult } from '../hooks/useAdminPagedList';

export interface ReservationFilters { search: string; bookingStatus: string; paymentStatus: string; date: string }

export async function getAdminReservationsPage<T>(filters: ReservationFilters, page: number, size: number): Promise<AdminPageResult<T>> {
  const result = await readWithAdminSession(() => (supabase as any).rpc('list_admin_bookings', {
    p_search: filters.search,
    p_booking_status: filters.bookingStatus,
    p_payment_status: filters.paymentStatus,
    p_tour_date: filters.date || null,
    p_offset: (page - 1) * size,
    p_limit: size,
  })) as AdminPageResult<T> | null;
  if (!result || !Array.isArray(result.rows) || typeof result.total !== 'number') {
    throw new Error('No se pudo leer la página de reservas.');
  }
  return result;
}

// Quote PostgREST filter values and escape LIKE wildcards: search is literal text.
export function adminSearchFilter(columns: string[], search: string): string {
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  return columns.map((column) => `${column}.ilike.${JSON.stringify(pattern)}`).join(',');
}

export async function getAdminTablePage<T>(makeQuery: () => any, page: number, size: number): Promise<AdminPageResult<T>> {
  const result = await readWithAdminSession(() => makeQuery().range((page - 1) * size, page * size - 1).then((response: any) => {
    if (!response.error && typeof response.count !== 'number') throw new Error('No se pudo obtener el total del listado.');
    return { ...response, data: { rows: response.data ?? [], total: response.count ?? 0 } };
  })) as AdminPageResult<T> | null;
  return result ?? { rows: [], total: 0 };
}
