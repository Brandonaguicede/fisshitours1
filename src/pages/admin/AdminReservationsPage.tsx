import { Check, Download, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
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
      <AdminPageHeader
        title="Reservas"
        description="Gestiona solicitudes, estados de pago y disponibilidad."
        actions={<><button className="admin-btn" type="button"><Plus size={16} /> Crear reserva</button><button className="admin-btn admin-btn--secondary" type="button"><Download size={16} /> Exportar</button></>}
      />

      <AdminToolbar>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ocean-400" size={15} />
          <input className="admin-input pl-9" placeholder="Buscar cliente, email o WhatsApp" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className="admin-select" value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}>
          {bookingStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className="admin-select" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
          {paymentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input className="admin-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
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
        <AdminTable headers={['Referencia', 'Cliente', 'Fecha', 'Bote / tour', 'Personas', 'Total', 'Metodo', 'Pago', 'Reserva', 'Acciones']}>
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
    </div>
  );
}
