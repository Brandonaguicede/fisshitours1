import { Check, Download, Filter, Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AdminBadge, AdminModuleSurface, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { getActiveBoatTours, getActiveTimeSlots } from '../../services/boatTourService';
import { adminCreateBooking, confirmBooking, getActiveDepartureLocations, retryConfirmationEmail, updateBooking, type DepartureLocation } from '../../services/bookingService';
import type { BoatTour, TourTimeSlot } from '../../types/boatTour';
import { money } from './adminMockData';

interface AdminReservation {
  id: string;
  boat_id: string;
  tour_id: string;
  tour_package_id: string;
  time_slot_id: string;
  special_requests: string | null;
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
    email: string | null;
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
  specialRequests: '',
};

type ManualBookingForm = typeof emptyManualBooking;

type EditBookingForm = {
  fullName: string;
  email: string;
  whatsapp: string;
  country: string;
  tourPackageId: string;
  tourDate: string;
  timeSlotId: string;
  guests: number;
  specialRequests: string;
};

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
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingReservation, setEditingReservation] = useState<AdminReservation | null>(null);
  const [editForm, setEditForm] = useState<EditBookingForm | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmationSentByBooking, setConfirmationSentByBooking] = useState<Record<string, boolean>>({});
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

    const [{ data, error }, { data: notificationRows }] = await Promise.all([
      db
      .from('bookings')
      .select(`
        id,
        boat_id,
        tour_id,
        tour_package_id,
        time_slot_id,
        special_requests,
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
      .order('created_at', { ascending: false }),
      db.from('booking_notifications').select('booking_id, dedupe_key, sent_at')
        .like('dedupe_key', 'booking:%:paypal-confirmation-customer-email'),
    ]);

    setLoading(false);
    if (error) {
      setReservations([]);
      setError(error.message);
      return;
    }

    setReservations((data ?? []) as AdminReservation[]);
    setConfirmationSentByBooking(Object.fromEntries((notificationRows ?? []).map((row: { booking_id: string; sent_at: string | null }) => [row.booking_id, Boolean(row.sent_at)])));
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

    let confirmationResult = { customerEmailPresent: false, emailQueued: false };
    const { error } = nextBookingStatus === 'confirmed'
      ? await confirmBooking(reservation.id)
        .then((result) => {
          confirmationResult = result;
          return { error: null };
        }, (confirmError) => ({ error: confirmError }))
      : await db.rpc('update_booking_status', {
        p_booking_id: reservation.id,
        p_booking_status: nextBookingStatus,
        p_payment_status: nextPaymentStatus,
        p_note: 'Reserva cancelada desde admin. Bloqueo liberado.',
      });

    setBusyId('');
    if (error) {
      setError(error.message);
      return;
    }

    if (nextBookingStatus === 'confirmed') {
      const customerEmailPresent = confirmationResult.customerEmailPresent;
      const emailQueued = confirmationResult.emailQueued;
      setNotice(!customerEmailPresent
        ? 'Reserva confirmada. El cliente no tiene email; no se envió correo. El bote queda bloqueado.'
        : emailQueued
          ? 'Reserva confirmada. El correo de confirmación quedó encolado y el bote queda bloqueado.'
          : 'Reserva confirmada, pero el correo no pudo encolarse. El bote queda bloqueado.');
    } else {
      setNotice('Reserva cancelada. El bloqueo de disponibilidad fue liberado.');
    }
    await loadReservations();
  }

  async function retryReservationConfirmation(reservation: AdminReservation) {
    setBusyId(reservation.id);
    setNotice('');
    setError('');
    try {
      const result = await retryConfirmationEmail(reservation.id);
      setNotice(result.customerEmailPresent
        ? 'La confirmación quedó encolada para reintento.'
        : 'La reserva no tiene email; no se encoló ningún correo.');
      await loadReservations();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'No se pudo reintentar el correo.');
    } finally {
      setBusyId('');
    }
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

  function openEdit(reservation: AdminReservation) {
    const tour = tours.find((item) => item.id === reservation.tour_package_id);
    setEditingReservation(reservation);
    setEditForm({
      fullName: reservation.customers?.full_name ?? '',
      email: reservation.customers?.email ?? '',
      whatsapp: reservation.customers?.whatsapp ?? '',
      country: '',
      tourPackageId: tour?.id ?? reservation.tour_package_id ?? tours[0]?.id ?? '',
      tourDate: reservation.tour_date,
      timeSlotId: reservation.time_slot_id ?? timeSlots[0]?.id ?? '',
      guests: reservation.guests,
      specialRequests: reservation.special_requests ?? '',
    });
    setEditOpen(true);
  }

  function updateEditForm<K extends keyof EditBookingForm>(key: K, value: EditBookingForm[K]) {
    setEditForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveEdit() {
    if (!editingReservation || !editForm) return;
    const selectedEditTour = tours.find((tour) => tour.id === editForm.tourPackageId);
    if (!selectedEditTour?.boatId || !selectedEditTour.tourId) {
      setError('Selecciona un tour y paquete válidos.');
      return;
    }
    setEditSaving(true);
    setError('');
    setNotice('');
    try {
      await updateBooking({
        bookingId: editingReservation.id,
        customer: { fullName: editForm.fullName, email: editForm.email, whatsapp: editForm.whatsapp, country: editForm.country },
        boatId: selectedEditTour.boatId,
        tourId: selectedEditTour.tourId,
        tourPackageId: selectedEditTour.id,
        tourDate: editForm.tourDate,
        timeSlotId: editForm.timeSlotId,
        guests: Number(editForm.guests),
        specialRequests: editForm.specialRequests,
      });
      setEditOpen(false);
      setEditingReservation(null);
      setEditForm(null);
      setNotice('Cambios guardados. El estado y el pago de la reserva se conservaron; no se envió confirmación.');
      await loadReservations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la reserva.');
    } finally {
      setEditSaving(false);
    }
  }

  function exportCsv() {
    const rows = visibleReservations.map((reservation) => ({
      'Referencia de reserva': reservation.booking_reference,
      'Nombre del cliente': reservation.customers?.full_name ?? '',
      'Correo electrónico': reservation.customers?.email ?? '',
      WhatsApp: reservation.customers?.whatsapp ?? '',
      'Fecha del tour': reservation.tour_date,
      Horario: reservation.time_slots?.label ?? '',
      Bote: reservation.boats?.name ?? '',
      Tour: reservation.tours?.title ?? '',
      Personas: String(reservation.guests),
      'Lugar de salida': reservation.departure_location_name_snapshot ?? '',
      'Cargo de salida (USD)': Number(reservation.departure_surcharge_snapshot ?? 0).toFixed(2),
      'Total (USD)': Number(reservation.total_snapshot ?? 0).toFixed(2),
      'Método de pago': reservation.payment_method_key,
      'Estado del pago': reservation.payment_status,
      'Estado de reserva': reservation.booking_status,
      'Creada el': new Date(reservation.created_at).toLocaleString('es-CR'),
    }));
    const headers = Object.keys(rows[0] ?? { 'Referencia de reserva': '', 'Nombre del cliente': '', 'Correo electrónico': '', WhatsApp: '', 'Fecha del tour': '', Horario: '', Bote: '', Tour: '', Personas: '', 'Lugar de salida': '', 'Cargo de salida (USD)': '', 'Total (USD)': '', 'Método de pago': '', 'Estado del pago': '', 'Estado de reserva': '', 'Creada el': '' });
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => csvCell((row as Record<string, string>)[header])).join(',')),
    ].join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
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
        adminNote: 'Reserva manual guardada desde WhatsApp/link. Pendiente de confirmación administrativa.',
      });
      setManualOpen(false);
      setManualForm(emptyManualBooking);
      setNotice(`Reserva ${result.booking_reference} guardada como pendiente. Usa "Confirmar" para confirmar y enviar el correo.`);
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
                  <button className="admin-btn admin-btn--secondary" type="button" disabled={busyId === reservation.id} onClick={() => openEdit(reservation)}>Editar</button>
                  <button
                    className="admin-btn admin-btn--success"
                    type="button"
                    disabled={busyId === reservation.id || reservation.booking_status === 'confirmed' || reservation.booking_status === 'cancelled'}
                    onClick={() => void updateReservationStatus(reservation, 'confirmed')}
                  >
                    <Check size={14} /> Confirmar
                  </button>
                  {reservation.booking_status === 'confirmed' && reservation.customers?.email && !confirmationSentByBooking[reservation.id] ? (
                    <button
                      className="admin-btn admin-btn--secondary"
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => void retryReservationConfirmation(reservation)}
                    >
                      Reintentar email
                    </button>
                  ) : null}
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
                  <input className="admin-input" type="email" value={manualForm.email} onChange={(event) => updateManualForm('email', event.target.value)} />
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
      <Modal open={editOpen} onClose={() => setEditOpen(false)} titleId="edit-booking-title" className="admin-reservation-modal">
        <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
          <header className="admin-modal-header">
            <div>
              <h2 id="edit-booking-title" className="admin-card__title">Editar reserva</h2>
              <p className="admin-muted">Guardar cambios no confirma ni vuelve a enviar el correo.</p>
            </div>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditOpen(false)}><X size={18} /></button>
          </header>
          {editForm ? <div className="admin-modal-body"><div className="admin-form-section"><div className="admin-form-columns">
            <label className="admin-field"><span className="admin-field__label">Nombre del cliente</span><input className="admin-input" required value={editForm.fullName} onChange={(event) => updateEditForm('fullName', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Email</span><input className="admin-input" type="email" value={editForm.email} onChange={(event) => updateEditForm('email', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">WhatsApp</span><input className="admin-input" required value={editForm.whatsapp} onChange={(event) => updateEditForm('whatsapp', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Tour / paquete</span><select className="admin-select" required value={editForm.tourPackageId} onChange={(event) => updateEditForm('tourPackageId', event.target.value)}>{tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.tourTitle ?? tour.name} - {tour.name}</option>)}</select></label>
            <label className="admin-field"><span className="admin-field__label">Fecha</span><input className="admin-input" required type="date" value={editForm.tourDate} onChange={(event) => updateEditForm('tourDate', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Hora</span><select className="admin-select" required value={editForm.timeSlotId} onChange={(event) => updateEditForm('timeSlotId', event.target.value)}>{timeSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label>
            <label className="admin-field"><span className="admin-field__label">Personas</span><input className="admin-input" required type="number" min={1} value={editForm.guests} onChange={(event) => updateEditForm('guests', Number(event.target.value))} /></label>
            <label className="admin-field admin-field--wide"><span className="admin-field__label">Notas</span><textarea className="admin-input admin-textarea-list" value={editForm.specialRequests} onChange={(event) => updateEditForm('specialRequests', event.target.value)} /></label>
          </div></div></div> : null}
          <footer className="admin-modal-footer"><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditOpen(false)}>Cancelar</button><button className="admin-btn" type="submit" disabled={editSaving || !editForm}>{editSaving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Guardar cambios</button></footer>
        </form>
      </Modal>
    </div>
  );
}

function csvCell(value: string) {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
