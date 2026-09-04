import { Check, Download, Filter, Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AdminBadge, AdminModuleSurface, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { getActiveBoatTours, getActiveTimeSlots } from '../../services/boatTourService';
import { adminCreateBooking, getActiveDepartureLocations, type DepartureLocation } from '../../services/bookingService';
import type { BoatTour, TourTimeSlot } from '../../types/boatTour';
import { money } from './adminMockData';

interface AdminReservation {
  id: string;
  booking_reference: string;
  tour_date: string;
  guests: number;
  total_snapshot: number;
  departure_location_name_snapshot: string | null;
  departure_surcharge_snapshot: number | null;
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

const emptyManualBooking = {
  fullName: '',
  email: '',
  whatsapp: '',
  country: 'Costa Rica',
  tourPackageId: '',
  tourDate: '',
  timeSlotId: '',
  guests: 1,
  departureLocationId: '',
  markAsPaid: true,
  specialRequests: '',
};

type ManualBookingForm = typeof emptyManualBooking;

export default function AdminReservationsPage() {
  const db = supabase as any;
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [tours, setTours] = useState<BoatTour[]>([]);
  const [timeSlots, setTimeSlots] = useState<TourTimeSlot[]>([]);
  const [departureLocations, setDepartureLocations] = useState<DepartureLocation[]>([]);
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualBookingForm>(emptyManualBooking);
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
        departure_location_name_snapshot,
        departure_surcharge_snapshot,
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
    const channel = db
      .channel('admin-reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => void loadReservations())
      .subscribe();
    const interval = window.setInterval(() => void loadReservations(), 30000);
    return () => {
      window.clearInterval(interval);
      void db.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    async function loadCatalog() {
      setCatalogLoading(true);
      try {
        const [tourRows, slotRows, locationRows] = await Promise.all([
          getActiveBoatTours(),
          getActiveTimeSlots(),
          getActiveDepartureLocations(),
        ]);
        setTours(tourRows);
        setTimeSlots(slotRows);
        setDepartureLocations(locationRows);
        setManualForm((current) => ({
          ...current,
          tourPackageId: current.tourPackageId || tourRows[0]?.id || '',
          timeSlotId: current.timeSlotId || slotRows[0]?.id || '',
          departureLocationId: current.departureLocationId || locationRows.find((item) => item.is_default)?.id || locationRows[0]?.id || '',
        }));
      } catch (catalogError) {
        setError(catalogError instanceof Error ? catalogError.message : 'No se pudo cargar el catalogo para crear reservas.');
      } finally {
        setCatalogLoading(false);
      }
    }

    void loadCatalog();
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

  const selectedTour = useMemo(() => tours.find((tour) => tour.id === manualForm.tourPackageId), [manualForm.tourPackageId, tours]);
  const manualMaxGuests = useMemo(() => {
    if (!selectedTour) return 30;
    return Math.min(selectedTour.maxGuests, selectedTour.boatMaxGuests ?? selectedTour.maxGuests);
  }, [selectedTour]);
  const manualTotalPreview = useMemo(() => {
    if (!selectedTour) return 0;
    const location = departureLocations.find((item) => item.id === manualForm.departureLocationId);
    const extraGuests = Math.max(0, Number(manualForm.guests) - selectedTour.includedGuests);
    return selectedTour.basePrice + (extraGuests * selectedTour.extraGuestPrice) + Number(location?.surcharge_amount ?? 0);
  }, [departureLocations, manualForm.departureLocationId, manualForm.guests, selectedTour]);

  function updateManualForm<K extends keyof ManualBookingForm>(key: K, value: ManualBookingForm[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function exportCsv() {
    const rows = visibleReservations.map((reservation) => ({
      Referencia: reservation.booking_reference,
      Cliente: reservation.customers?.full_name ?? '',
      Email: reservation.customers?.email ?? '',
      WhatsApp: reservation.customers?.whatsapp ?? '',
      Fecha: reservation.tour_date,
      Hora: reservation.time_slots?.label ?? '',
      Bote: reservation.boats?.name ?? '',
      Tour: reservation.tours?.title ?? '',
      Personas: String(reservation.guests),
      Salida: reservation.departure_location_name_snapshot ?? '',
      CargoSalida: String(Number(reservation.departure_surcharge_snapshot ?? 0)),
      Total: String(Number(reservation.total_snapshot ?? 0)),
      Metodo: reservation.payment_method_key,
      Pago: reservation.payment_status,
      Estado: reservation.booking_status,
      Creada: reservation.created_at,
    }));
    const headers = Object.keys(rows[0] ?? { Referencia: '', Cliente: '', Email: '', WhatsApp: '', Fecha: '', Hora: '', Bote: '', Tour: '', Personas: '', Salida: '', CargoSalida: '', Total: '', Metodo: '', Pago: '', Estado: '', Creada: '' });
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => csvCell((row as Record<string, string>)[header])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reservas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createManualReservation() {
    setManualSaving(true);
    setError('');
    setNotice('');
    try {
      if (!selectedTour?.boatId || !selectedTour.tourId) throw new Error('Selecciona un tour valido.');
      const result = await adminCreateBooking({
        customer: {
          fullName: manualForm.fullName,
          email: manualForm.email,
          whatsapp: manualForm.whatsapp,
          country: manualForm.country,
        },
        boatId: selectedTour.boatId,
        tourId: selectedTour.tourId,
        tourPackageId: selectedTour.id,
        tourDate: manualForm.tourDate,
        timeSlotId: manualForm.timeSlotId,
        guests: Number(manualForm.guests),
        departureLocationId: manualForm.departureLocationId,
        paymentMethodKey: 'whatsapp-link',
        extras: [],
        specialRequests: manualForm.specialRequests,
        markAsPaid: manualForm.markAsPaid,
        adminNote: manualForm.markAsPaid
          ? 'Reserva manual creada desde WhatsApp/link y marcada como pagada.'
          : 'Reserva manual creada desde WhatsApp/link pendiente de pago.',
      });
      setManualOpen(false);
      setManualForm(emptyManualBooking);
      setNotice(`Reserva ${result.booking_reference} creada${manualForm.markAsPaid ? ' y marcada como pagada' : ''}.`);
      await loadReservations();
    } catch (manualError) {
      setError(manualError instanceof Error ? manualError.message : 'No se pudo crear la reserva manual.');
    } finally {
      setManualSaving(false);
    }
  }

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
          <button className="admin-btn" type="button" onClick={() => setManualOpen(true)}><Plus size={16} /> Crear reserva</button>
          <button className="admin-btn admin-btn--secondary" type="button" onClick={exportCsv}><Download size={16} /> Exportar</button>
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
        <AdminTable embedded headers={['Referencia', 'Cliente', 'Fecha', 'Bote / tour', 'Personas', 'Salida', 'Total', 'Metodo', 'Pago', 'Reserva', 'Acciones']}>
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
              <td>{reservation.departure_location_name_snapshot ?? '-'}<div className="admin-muted">{Number(reservation.departure_surcharge_snapshot ?? 0) > 0 ? money(Number(reservation.departure_surcharge_snapshot)) : 'Sin costo'}</div></td>
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
              <td colSpan={11} className="admin-muted">No hay reservas para este filtro.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}
      </AdminModuleSurface>
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} titleId="manual-booking-title" className="admin-reservation-modal">
        <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void createManualReservation(); }}>
          <header className="admin-modal-header">
            <div>
              <h2 id="manual-booking-title" className="admin-card__title"><Plus size={18} /> Crear reserva manual</h2>
              <p className="admin-muted">Para reservas que entran por WhatsApp o pago por link.</p>
            </div>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setManualOpen(false)}><X size={18} /></button>
          </header>
          <div className="admin-modal-body">
            {catalogLoading ? <div className="admin-alert">Cargando opciones...</div> : null}
            <div className="admin-form-section">
              <div className="admin-form-columns">
                <label className="admin-field">
                  <span className="admin-field__label">Nombre del cliente</span>
                  <input className="admin-input" required value={manualForm.fullName} onChange={(event) => updateManualForm('fullName', event.target.value)} />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Email</span>
                  <input className="admin-input" required type="email" value={manualForm.email} onChange={(event) => updateManualForm('email', event.target.value)} />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">WhatsApp</span>
                  <input className="admin-input" required value={manualForm.whatsapp} onChange={(event) => updateManualForm('whatsapp', event.target.value)} />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Pais</span>
                  <input className="admin-input" value={manualForm.country} onChange={(event) => updateManualForm('country', event.target.value)} />
                </label>
                <label className="admin-field admin-field--wide">
                  <span className="admin-field__label">Tour / paquete</span>
                  <select className="admin-select" required value={manualForm.tourPackageId} onChange={(event) => updateManualForm('tourPackageId', event.target.value)}>
                    <option value="">Selecciona un tour</option>
                    {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.tourTitle ?? tour.name} - {tour.name} ({money(tour.basePrice)})</option>)}
                  </select>
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Fecha</span>
                  <input className="admin-input" required type="date" value={manualForm.tourDate} onChange={(event) => updateManualForm('tourDate', event.target.value)} />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Hora</span>
                  <select className="admin-select" required value={manualForm.timeSlotId} onChange={(event) => updateManualForm('timeSlotId', event.target.value)}>
                    <option value="">Selecciona horario</option>
                    {timeSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                  </select>
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Personas</span>
                  <input className="admin-input" required type="number" min={1} max={manualMaxGuests} value={manualForm.guests} onChange={(event) => updateManualForm('guests', Number(event.target.value))} />
                  {selectedTour ? <span className="admin-field-help">Máximo {manualMaxGuests} (mínimo entre capacidad del paquete y del bote).</span> : null}
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Lugar de salida</span>
                  <select className="admin-select" required value={manualForm.departureLocationId} onChange={(event) => updateManualForm('departureLocationId', event.target.value)}>
                    <option value="">Selecciona salida</option>
                    {departureLocations.map((location) => <option key={location.id} value={location.id}>{location.name} {Number(location.surcharge_amount) > 0 ? `+ USD ${location.surcharge_amount}` : '- sin costo'}</option>)}
                  </select>
                </label>
                <label className="admin-field admin-field--wide">
                  <span className="admin-field__label">Notas</span>
                  <textarea className="admin-input admin-textarea-list" value={manualForm.specialRequests} onChange={(event) => updateManualForm('specialRequests', event.target.value)} />
                </label>
                <label className="admin-check admin-field--wide">
                  <input type="checkbox" checked={manualForm.markAsPaid} onChange={(event) => updateManualForm('markAsPaid', event.target.checked)} />
                  Marcar como pagada y confirmada
                </label>
              </div>
              <div className="admin-reservation-total">
                <span>Total estimado</span>
                <strong>{money(manualTotalPreview)}</strong>
                <small>El total definitivo lo recalcula Supabase al guardar.</small>
              </div>
            </div>
          </div>
          <footer className="admin-modal-footer">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setManualOpen(false)}>Cancelar</button>
            <button className="admin-btn" type="submit" disabled={manualSaving || catalogLoading}>
              {manualSaving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
              Crear reserva
            </button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}

function csvCell(value: string) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}
