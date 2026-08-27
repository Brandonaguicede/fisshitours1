import { Check, Download, Filter, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AdminBadge, AdminModuleSurface, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { money } from './adminMockData';

interface AdminReservation {
  id: string;
  booking_reference: string;
  tour_date: string;
  guests: number;
  total_snapshot: number;
  payment_method_key: string;
  payment_status: string;
  booking_status: string;
  created_at: string;
  customers: {
    full_name: string;
    email: string;
    whatsapp: string;
  } | null;
  boats: {
    name: string;
  } | null;
  tours: {
    title: string;
  } | null;
  time_slots: {
    label: string;
  } | null;
}

const bookingStatusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending_payment', label: 'Pago pendiente' },
  { value: 'pending_confirmation', label: 'Por confirmar' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'completed', label: 'Completadas' },
];

const paymentStatusOptions = [
  { value: 'all', label: 'Todos los pagos' },
  { value: 'paid', label: 'Pagado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'processing', label: 'Procesando' },
  { value: 'not_required_yet', label: 'Pago en tour' },
  { value: 'failed', label: 'Fallido' },
  { value: 'refunded', label: 'Reembolsado' },
];

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt|admin or editor/i.test(message);
}

export default function AdminReservationsPage() {
  const db = supabase as any;
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const firstFilterRef = useRef<HTMLSelectElement>(null);
  const activeFilterCount = Number(bookingStatus !== 'all') + Number(paymentStatus !== 'all') + Number(Boolean(date));

  useEffect(() => {
    if (!filtersOpen) return;
    firstFilterRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersOpen(false);
        filterTriggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!filterPanelRef.current?.contains(target) && !filterTriggerRef.current?.contains(target)) setFiltersOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [filtersOpen]);

  function resetFilters() {
    setBookingStatus('all');
    setPaymentStatus('all');
    setDate('');
  }

  async function loadReservations() {
    setLoading(true);
    setError('');

    const { data, error } = await db
      .from('bookings')
      .select(`
        id,
        booking_reference,
        tour_date,
        guests,
        total_snapshot,
        payment_method_key,
        payment_status,
        booking_status,
        created_at,
        customers (full_name, email, whatsapp),
        boats (name),
        tours (title),
        time_slots (label)
      `)
      .order('tour_date', { ascending: true })
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      setReservations([]);
      setError(error.message);
      return;
    }

    setReservations((data ?? []) as AdminReservation[]);
  }

  useEffect(() => {
    void loadReservations();
  }, []);

  async function updateReservationStatus(reservation: AdminReservation, nextBookingStatus: 'confirmed' | 'cancelled') {
    setBusyId(reservation.id);
    setNotice('');
    setError('');

    const nextPaymentStatus =
      nextBookingStatus === 'cancelled' && reservation.payment_status !== 'paid'
        ? 'failed'
        : reservation.payment_status;

    const { error } = await db.rpc('update_booking_status', {
      p_booking_id: reservation.id,
      p_booking_status: nextBookingStatus,
      p_payment_status: nextPaymentStatus,
      p_note: nextBookingStatus === 'confirmed'
        ? 'Reserva confirmada desde admin. Bote bloqueado en disponibilidad.'
        : 'Reserva cancelada desde admin. Bloqueo liberado.',
    });

    setBusyId('');
    if (error) {
      setError(error.message);
      return;
    }

    setNotice(nextBookingStatus === 'confirmed'
      ? 'Reserva confirmada. El bote queda bloqueado para esa fecha y horario.'
      : 'Reserva cancelada. El bloqueo de disponibilidad fue liberado.');
    await loadReservations();
  }

  const visibleReservations = useMemo(() => {
    return reservations.filter((reservation) => {
      const searchable = [
        reservation.booking_reference,
        reservation.customers?.full_name,
        reservation.customers?.email,
        reservation.customers?.whatsapp,
        reservation.boats?.name,
        reservation.tours?.title,
      ].join(' ').toLowerCase();

      return (!search || searchable.includes(search.toLowerCase()))
        && (bookingStatus === 'all' || reservation.booking_status === bookingStatus)
        && (paymentStatus === 'all' || reservation.payment_status === paymentStatus)
        && (!date || reservation.tour_date === date);
    });
  }, [bookingStatus, date, paymentStatus, reservations, search]);

  return (
    <div className="admin-page">
      <AdminModuleSurface className="admin-reservations-surface">
      <AdminToolbar embedded>
        <div className="admin-search-field">
          <Search aria-hidden="true" size={16} />
          <input className="admin-input" aria-label="Buscar reservas" placeholder="Buscar reservas por cliente, email o WhatsApp" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="admin-filter-menu">
          <button
            ref={filterTriggerRef}
            className="admin-btn admin-btn--secondary admin-filter-trigger"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="reservation-filters"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Filter size={16} /> <span>Filtros</span>
            {activeFilterCount > 0 ? <AdminBadge value={String(activeFilterCount)} /> : null}
          </button>
          {filtersOpen ? (
            <>
              <div className="admin-filter-backdrop" aria-hidden="true" />
              <div ref={filterPanelRef} id="reservation-filters" className="admin-filter-panel" role="dialog" aria-label="Filtros de reservas">
                <div className="admin-filter-panel__header">
                  <div><strong>Filtros</strong><span>Refina la lista de reservas.</span></div>
                  <button className="admin-icon-btn" type="button" aria-label="Cerrar filtros" onClick={() => { setFiltersOpen(false); filterTriggerRef.current?.focus(); }}><X size={17} /></button>
                </div>
                <label className="admin-field">
                  <span className="admin-field__label">Estado de reserva</span>
                  <select ref={firstFilterRef} className="admin-select" value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}>
                    {bookingStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Estado de pago</span>
                  <select className="admin-select" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                    {paymentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Fecha del tour</span>
                  <input className="admin-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <div className="admin-filter-panel__actions">
                  <button className="admin-btn admin-btn--ghost" type="button" disabled={activeFilterCount === 0} onClick={resetFilters}>Limpiar</button>
                  <button className="admin-btn" type="button" onClick={() => { setFiltersOpen(false); filterTriggerRef.current?.focus(); }}>Listo</button>
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div className="admin-toolbar__actions">
          <button className="admin-btn" type="button"><Plus size={16} /> Crear reserva</button>
          <button className="admin-btn admin-btn--secondary" type="button"><Download size={16} /> Exportar</button>
        </div>
      </AdminToolbar>

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo actualizar reservas: se requiere una sesion de admin/editor en Supabase.'
            : error}
        </div>
      ) : null}

      {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando reservas...</p>
      ) : (
        <AdminTable embedded headers={['Referencia', 'Cliente', 'Fecha', 'Bote / tour', 'Personas', 'Total', 'Metodo', 'Pago', 'Reserva', 'Acciones']}>
          {visibleReservations.map((reservation) => (
            <tr key={reservation.id}>
              <td>{reservation.booking_reference}</td>
              <td>
                {reservation.customers?.full_name ?? '-'}
                <div className="admin-muted">{reservation.customers?.email ?? reservation.customers?.whatsapp ?? '-'}</div>
              </td>
              <td>
                {reservation.tour_date}
                <div className="admin-muted">{reservation.time_slots?.label ?? '-'}</div>
              </td>
              <td>{reservation.boats?.name ?? '-'}<div className="admin-muted">{reservation.tours?.title ?? '-'}</div></td>
              <td>{reservation.guests}</td>
              <td>{money(Number(reservation.total_snapshot))}</td>
              <td>{reservation.payment_method_key}</td>
              <td><AdminBadge value={reservation.payment_status} /></td>
              <td><AdminBadge value={reservation.booking_status} /></td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="admin-btn admin-btn--success"
                    type="button"
                    disabled={busyId === reservation.id || reservation.booking_status === 'confirmed' || reservation.booking_status === 'cancelled'}
                    onClick={() => void updateReservationStatus(reservation, 'confirmed')}
                  >
                    <Check size={14} /> Confirmar
                  </button>
                  <button
                    className="admin-btn admin-btn--danger"
                    type="button"
                    disabled={busyId === reservation.id || reservation.booking_status === 'cancelled'}
                    onClick={() => void updateReservationStatus(reservation, 'cancelled')}
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {visibleReservations.length === 0 ? (
            <tr>
              <td colSpan={10} className="admin-muted">No hay reservas para este filtro.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}
      </AdminModuleSurface>
    </div>
  );
}
