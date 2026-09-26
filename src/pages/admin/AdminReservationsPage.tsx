import { formatTime, money } from '../../utils/format';
import { Calendar, Check, CheckCircle2, Clock, FileSpreadsheet, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminBadge, AdminCreateButton, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminStatCard, AdminTable } from '../../components/admin/AdminPrimitives';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { readWithAdminSession } from '../../services/adminAuthService';
import { AdminExportMenu } from '../../components/admin/AdminExportMenu';
import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { getAdminReservationsPage } from '../../services/adminListService';
import { getActiveBoatTours, getActiveTimeSlots } from '../../services/boatTourService';
import { adminCreateBooking, confirmBooking, getActiveDepartureLocations, retryConfirmationEmail, updateBooking, type DepartureLocation } from '../../services/bookingService';
import type { BoatTour, TourTimeSlot } from '../../types/boatTour';
import { loadLogoDataUrl } from '../../utils/exportBrand';
import {
  PAYMENT_STATUS_LABELS,
  activeReservationFilterLabels,
  buildReservationExportRows,
  computeReservationStats,
  createReservationsXlsx,
  downloadBlob,
  fetchAllReservations,
  formatPaymentMethodLabel,
  formatPaymentStatusLabel,
  loadAllBookingStatuses,
  reservationsFileName,
  type AdminReservation,
} from '../../utils/reservationsExport';

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
  ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
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
  const queryClient = useQueryClient();
  const [tours, setTours] = useState<BoatTour[]>([]);
  const [timeSlots, setTimeSlots] = useState<TourTimeSlot[]>([]);
  const [departureLocations, setDepartureLocations] = useState<DepartureLocation[]>([]);
  const [paymentMethodNames, setPaymentMethodNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [date, setDate] = useState('');
  const [exporting, setExporting] = useState<'' | 'xlsx' | 'pdf'>('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingReservation, setEditingReservation] = useState<AdminReservation | null>(null);
  const [editForm, setEditForm] = useState<EditBookingForm | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<AdminReservation | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualBookingForm>(emptyManualBooking);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const activeFilterCount = Number(bookingStatus !== 'all') + Number(paymentStatus !== 'all') + Number(Boolean(date));
  const filters = { search, bookingStatus, paymentStatus, date };
  const pagination = useAdminPagedList<AdminReservation>('reservations', JSON.stringify(filters), (page, size) => getAdminReservationsPage(filters, page, size));
  const reservations = pagination.rows;
  const visibleReservations = reservations;
  const loading = pagination.query.isFetching;
  const listError = pagination.query.error instanceof Error ? pagination.query.error.message : '';
  const notificationIds = reservations.map((reservation) => reservation.id);
  const notificationsQuery = useQuery({
    queryKey: ['admin', 'reservationNotifications', notificationIds],
    enabled: notificationIds.length > 0 && !pagination.query.isPlaceholderData,
    queryFn: () => readWithAdminSession(() => db.from('booking_notifications').select('booking_id, dedupe_key, sent_at')
      .in('booking_id', notificationIds).like('dedupe_key', 'booking:%:paypal-confirmation-customer-email')),
  });
  const confirmationSentByBooking = Object.fromEntries(((notificationsQuery.data ?? []) as Array<{ booking_id: string; sent_at: string | null }>).map((row) => [row.booking_id, Boolean(row.sent_at)]));
  const statsQuery = useQuery({
    queryKey: ['admin', 'reservationStats'],
    // Cards count every booking in the system (they do not follow the list's search/filters), once each by its own
    // booking_status. See computeReservationStats for exactly what each card includes.
    queryFn: async () => computeReservationStats(await loadAllBookingStatuses(
      async (from, to) => (await readWithAdminSession(() => db.from('bookings').select('booking_status').order('id').range(from, to))) as Array<{ booking_status: string }> | null,
    )),
    refetchInterval: 30_000,
    retry: false,
  });
  const stats = statsQuery.data;
  // A failed/unavailable count shows "—", never a made-up 0.
  const statValue = (value: number | undefined) => (statsQuery.isLoading ? '…' : value === undefined ? '—' : String(value));

  function resetFilters() {
    setBookingStatus('all');
    setPaymentStatus('all');
    setDate('');
  }

  async function loadReservations() {
    setError('');
    await pagination.query.refetch();
    await queryClient.invalidateQueries({ queryKey: ['admin', 'reservationNotifications'] });
  }

  useEffect(() => {
    const channel = db.channel('admin-reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'reservations'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'reservationStats'] });
      }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [queryClient]);

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
          departureLocationId: current.departureLocationId || locationRows[0]?.id || '',
        }));
      } catch (catalogError) {
        setError(catalogError instanceof Error ? catalogError.message : 'No se pudo cargar el catalogo para crear reservas.');
      } finally {
        setCatalogLoading(false);
      }
    }

    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Independent of the manual-booking catalog above: reservations can
    // reference a payment method that's since been renamed or deactivated,
    // so this loads every row (active or not) purely to show a readable
    // name instead of the raw key — never blocks or errors the page if it
    // fails, it just falls back to the key itself (see paymentMethodLabel).
    async function loadPaymentMethodNames() {
      const { data } = await db.from('payment_methods').select('key, name');
      if (data) setPaymentMethodNames(Object.fromEntries((data as Array<{ key: string; name: string }>).map((row) => [row.key, row.name])));
    }
    void loadPaymentMethodNames();
  }, []);

  function paymentMethodLabel(key: string) {
    return paymentMethodNames[key] ?? key;
  }

  function methodLabel(reservation: AdminReservation) {
    return formatPaymentMethodLabel(reservation.payment_method_key, paymentMethodLabel(reservation.payment_method_key));
  }

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

  const selectedTour = useMemo(() => tours.find((tour) => tour.id === manualForm.tourPackageId), [manualForm.tourPackageId, tours]);
  const manualTimeSlots = selectedTour?.timeSlots ?? [];
  const editTimeSlots = useMemo(() => {
    const available = tours.find((tour) => tour.id === editForm?.tourPackageId)?.timeSlots ?? [];
    const original = timeSlots.find((slot) => slot.id === editingReservation?.time_slot_id);
    const unchangedDeparture = editForm?.tourPackageId === editingReservation?.tour_package_id && editForm?.tourDate === editingReservation?.tour_date;
    return original && unchangedDeparture && !available.some((slot) => slot.id === original.id) ? [...available, original] : available;
  }, [tours, timeSlots, editForm?.tourPackageId, editForm?.tourDate, editingReservation]);
  useEffect(() => {
    setManualForm((current) => manualTimeSlots.some((slot) => slot.id === current.timeSlotId) ? current : { ...current, timeSlotId: manualTimeSlots[0]?.id ?? '' });
  }, [selectedTour]);
  useEffect(() => {
    setEditForm((current) => !current || editTimeSlots.some((slot) => slot.id === current.timeSlotId) ? current : { ...current, timeSlotId: editTimeSlots[0]?.id ?? '' });
  }, [editTimeSlots]);
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

  // Exports exactly what the admin is consulting: current search + filters, every page (not just the visible one).
  async function collectExportRows() {
    const all = await fetchAllReservations((page, size) => getAdminReservationsPage<AdminReservation>(filters, page, size));
    return buildReservationExportRows(all, paymentMethodLabel);
  }

  async function exportXlsx() {
    setExporting('xlsx');
    setError('');
    try {
      const [rows, logoDataUrl] = await Promise.all([collectExportRows(), loadLogoDataUrl()]);
      const workbook = await createReservationsXlsx({ rows, filters: activeReservationFilterLabels(filters), logoDataUrl });
      downloadBlob(workbook, reservationsFileName('xlsx'));
    } catch (exportError) {
      setError(exportError instanceof Error ? `No se pudo generar el Excel: ${exportError.message}` : 'No se pudo generar el Excel.');
    } finally {
      setExporting('');
    }
  }

  async function exportPdf() {
    setExporting('pdf');
    setError('');
    try {
      const [rows, logoDataUrl, { createReservationsPdf }] = await Promise.all([collectExportRows(), loadLogoDataUrl(), import('../../utils/reservationsPdf')]);
      const doc = await createReservationsPdf({ rows, filters: activeReservationFilterLabels(filters), logoDataUrl });
      doc.save(reservationsFileName('pdf'));
    } catch (exportError) {
      setError(exportError instanceof Error ? `No se pudo generar el PDF: ${exportError.message}` : 'No se pudo generar el PDF.');
    } finally {
      setExporting('');
    }
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

  // Same conditions the old green check used to enable itself (its `disabled`
  // rule, inverted): not already confirmed/cancelled, and PayPal bookings only
  // once the payment is verified as paid. Now it is simply hidden otherwise.
  function canConfirmReservation(reservation: AdminReservation) {
    if (reservation.booking_status === 'confirmed' || reservation.booking_status === 'cancelled') return false;
    return !(reservation.payment_method_key === 'paypal' && reservation.payment_status !== 'paid');
  }

  function renderReservationActions(reservation: AdminReservation) {
    const busy = loading || busyId === reservation.id;
    return (
      <div className="admin-row-actions admin-reservation-actions">
        {canConfirmReservation(reservation) ? (
          <button
            className="admin-action-btn admin-action-btn--confirm"
            type="button"
            title="Confirmar reserva"
            aria-label={`Confirmar reserva ${reservation.booking_reference}`}
            disabled={busy}
            onClick={() => setConfirmTarget(reservation)}
          >
            {busyId === reservation.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Confirmar
          </button>
        ) : null}
        {reservation.booking_status === 'confirmed' && reservation.customers?.email && !confirmationSentByBooking[reservation.id] ? (
          <button
            className="admin-action-btn"
            type="button"
            title="Reenviar correo"
            aria-label={`Reenviar correo de confirmación de ${reservation.booking_reference}`}
            disabled={busy}
            onClick={() => void retryReservationConfirmation(reservation)}
          >
            {busyId === reservation.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Reenviar correo
          </button>
        ) : null}
        <button className="admin-icon-action" type="button" title="Editar reserva" aria-label={`Editar reserva ${reservation.booking_reference}`} disabled={busy} onClick={() => openEdit(reservation)}><Pencil size={17} /></button>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <section className="admin-stat-grid">
        <AdminStatCard label="Reservas" value={statValue(stats?.total)} icon={Calendar} />
        <AdminStatCard label="Pendientes" value={statValue(stats?.pending)} icon={Clock} tone="warning" />
        <AdminStatCard label="Confirmadas" value={statValue(stats?.confirmed)} icon={CheckCircle2} tone="success" />
        <AdminStatCard label="Canceladas" value={statValue(stats?.cancelled)} icon={XCircle} tone="danger" />
      </section>
      <AdminModuleSurface className="admin-reservations-surface">
      <AdminListToolbar
        embedded
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar reservas por cliente, email o WhatsApp"
        filters={
          <AdminFilterMenu panelLabel="Filtros de reservas" panelDescription="Refina la lista de reservas." activeCount={activeFilterCount} onReset={resetFilters}>
            <label className="admin-field">
              <span className="admin-field__label">Estado de reserva</span>
              <select className="admin-select" aria-label="Estado de reserva" value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}>
                {bookingStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Estado de pago</span>
              <select className="admin-select" aria-label="Estado de pago" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                {paymentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Fecha del tour</span>
              <input className="admin-input" aria-label="Fecha del tour" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </AdminFilterMenu>
        }
        primaryAction={<AdminCreateButton label="Crear reserva" onClick={() => setManualOpen(true)} />}
        secondaryActions={
          <AdminExportMenu
            busy={exporting}
            options={[
              { key: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, title: 'Descarga en Excel (.xlsx) las reservas que ves con la búsqueda y los filtros actuales', onSelect: exportXlsx },
              { key: 'pdf', label: 'PDF (.pdf)', icon: FileText, title: 'Descarga en PDF las reservas que ves con la búsqueda y los filtros actuales', onSelect: exportPdf },
            ]}
          />
        }
      />

      {error || listError ? (
        <div className="admin-alert admin-alert--danger" role="alert">
          {needsEditorNotice(error || listError)
            ? 'No se pudo actualizar reservas: se requiere una sesion de admin/editor en Supabase.'
            : error || listError}
          <button className="admin-btn admin-btn--secondary" type="button" disabled={loading} onClick={() => void loadReservations()}>Reintentar</button>
        </div>
      ) : null}

      {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}

      {loading ? <p className="admin-muted" role="status">Cargando reservas...</p> : null}
      <div className="admin-reservation-list" aria-busy={loading}>
      <div className="admin-reservations-table">
        <AdminTable embedded headers={['Referencia', 'Cliente', 'Fecha', 'Reserva', 'Personas', 'Salida', 'Total', 'Pago', 'Estado', 'Acciones']}>
          {visibleReservations.map((reservation) => (
            <tr key={reservation.id}>
              <td>{reservation.booking_reference}</td>
              <td>
                <div className="admin-table__truncate" title={reservation.customers?.full_name ?? '-'}>{reservation.customers?.full_name ?? '-'}</div>
                <div className="admin-muted admin-table__truncate" title={reservation.customers?.email ?? reservation.customers?.whatsapp ?? '-'}>{reservation.customers?.email ?? reservation.customers?.whatsapp ?? '-'}</div>
              </td>
              <td>
                {reservation.tour_date}
                <div className="admin-muted">{reservation.time_slots?.label ?? '-'}</div>
              </td>
              <td>
                <div className="admin-table__truncate" title={reservation.boats?.name ?? '-'}>{reservation.boats?.name ?? '-'}</div>
                <div className="admin-muted admin-table__truncate" title={reservation.tours?.title ?? '-'}>{reservation.tours?.title ?? '-'}</div>
              </td>
              <td>{reservation.guests}</td>
              <td>
                <div className="admin-table__truncate" title={reservation.departure_location_name_snapshot ?? '-'}>{reservation.departure_location_name_snapshot ?? '-'}</div>
                <div className="admin-muted">{Number(reservation.departure_surcharge_snapshot ?? 0) > 0 ? money(Number(reservation.departure_surcharge_snapshot)) : 'Sin costo'}</div>
              </td>
              <td>{money(Number(reservation.total_snapshot))}</td>
              <td>
                <div className="admin-payment-cell">
                  <span className="admin-payment-cell__method">{methodLabel(reservation)}</span>
                  <AdminBadge value={reservation.payment_status} />
                </div>
              </td>
              <td><AdminBadge value={reservation.booking_status} /></td>
              <td>
                {renderReservationActions(reservation)}
              </td>
            </tr>
          ))}
          {!loading && !listError && visibleReservations.length === 0 ? (
            <tr>
              <td colSpan={10} className="admin-muted">No hay reservas para este filtro.</td>
            </tr>
          ) : null}
        </AdminTable>
      </div>
      <div className="admin-reservation-cards">
        {visibleReservations.map((reservation) => (
          <article className="admin-reservation-card" key={reservation.id}>
            <h2>{reservation.booking_reference}</h2>
            <p>{reservation.customers?.full_name ?? '-'}</p>
            <dl>
              <div><dt>Fecha</dt><dd>{reservation.tour_date}</dd></div>
              <div><dt>Horario</dt><dd>{reservation.time_slots?.label ?? '-'}</dd></div>
              <div><dt>Barco</dt><dd>{reservation.boats?.name ?? '-'}</dd></div>
              <div><dt>Tour</dt><dd>{reservation.tours?.title ?? '-'}</dd></div>
              <div><dt>Personas</dt><dd>{reservation.guests}</dd></div>
              <div><dt>Lugar de salida</dt><dd>{reservation.departure_location_name_snapshot ?? '-'}<div className="admin-muted">{Number(reservation.departure_surcharge_snapshot ?? 0) > 0 ? money(Number(reservation.departure_surcharge_snapshot)) : 'Sin costo'}</div></dd></div>
              <div><dt>Total</dt><dd>{money(Number(reservation.total_snapshot))}</dd></div>
              <div><dt>Método de pago</dt><dd>{methodLabel(reservation)}</dd></div>
              <div><dt>Estado de pago</dt><dd><AdminBadge value={reservation.payment_status} /></dd></div>
              <div><dt>Estado de reserva</dt><dd><AdminBadge value={reservation.booking_status} /></dd></div>
            </dl>
            {renderReservationActions(reservation)}
          </article>
        ))}
        {!loading && !listError && visibleReservations.length === 0 ? <p className="admin-empty">No hay reservas para este filtro.</p> : null}
      </div>
      </div>
      <AdminPagination {...pagination} noun="reservas" loading={loading} />
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
              <div className="admin-reservation-form">
                <label className="admin-field admin-reservation-form__half">
                  <span className="admin-field__label">Nombre del cliente</span>
                  <input className="admin-input" required value={manualForm.fullName} onChange={(event) => updateManualForm('fullName', event.target.value)} />
                </label>
                <label className="admin-field admin-reservation-form__half">
                  <span className="admin-field__label">Email</span>
                  <input className="admin-input" type="email" value={manualForm.email} onChange={(event) => updateManualForm('email', event.target.value)} />
                </label>
                <label className="admin-field admin-reservation-form__half">
                  <span className="admin-field__label">WhatsApp</span>
                  <input className="admin-input" required value={manualForm.whatsapp} onChange={(event) => updateManualForm('whatsapp', event.target.value)} />
                </label>
                <label className="admin-field admin-reservation-form__half">
                  <span className="admin-field__label">Pais</span>
                  <input className="admin-input" value={manualForm.country} onChange={(event) => updateManualForm('country', event.target.value)} />
                </label>
                <label className="admin-field admin-reservation-form__full">
                  <span className="admin-field__label">Tour / paquete</span>
                  <select className="admin-select" required value={manualForm.tourPackageId} onChange={(event) => updateManualForm('tourPackageId', event.target.value)}>
                    <option value="">Selecciona un tour</option>
                    {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.tourTitle ?? tour.name} - {tour.name} ({money(tour.basePrice)})</option>)}
                  </select>
                </label>
                <label className="admin-field admin-reservation-form__quarter">
                  <span className="admin-field__label">Fecha</span>
                  <input className="admin-input" required type="date" value={manualForm.tourDate} onChange={(event) => updateManualForm('tourDate', event.target.value)} />
                </label>
                <label className="admin-field admin-reservation-form__quarter">
                  <span className="admin-field__label">Hora</span>
                  <select className="admin-select" required value={manualForm.timeSlotId} onChange={(event) => updateManualForm('timeSlotId', event.target.value)}>
                    <option value="">Selecciona horario</option>
                    {manualTimeSlots.map((slot) => <option key={slot.id} value={slot.id}>{formatTime(slot.time)}</option>)}
                  </select>
                </label>
                <div className="admin-field admin-reservation-form__quarter">
                  <div className="admin-field__label-row">
                    <label className="admin-field__label" htmlFor="manual-booking-guests">Personas</label>
                    {selectedTour ? <span className="admin-field-help" id="manual-booking-guests-help" title="Mínimo entre la capacidad del paquete y la del bote">Máximo {manualMaxGuests}</span> : null}
                  </div>
                  <input id="manual-booking-guests" className="admin-input" required type="number" min={1} max={manualMaxGuests} aria-describedby={selectedTour ? 'manual-booking-guests-help' : undefined} value={manualForm.guests} onChange={(event) => updateManualForm('guests', Number(event.target.value))} />
                </div>
                <label className="admin-field admin-reservation-form__quarter">
                  <span className="admin-field__label">Lugar de salida</span>
                  <select className="admin-select" required value={manualForm.departureLocationId} onChange={(event) => updateManualForm('departureLocationId', event.target.value)}>
                    <option value="">Selecciona salida</option>
                    {departureLocations.map((location) => <option key={location.id} value={location.id}>{location.name} {Number(location.surcharge_amount) > 0 ? `+ USD ${location.surcharge_amount}` : '- sin costo'}</option>)}
                  </select>
                </label>
                <label className="admin-field admin-reservation-form__full">
                  <span className="admin-field__label">Notas</span>
                  <textarea className="admin-input admin-textarea-list" value={manualForm.specialRequests} onChange={(event) => updateManualForm('specialRequests', event.target.value)} />
                </label>
              </div>
              <div className="admin-reservation-total">
                <div className="admin-reservation-total__copy">
                  <span className="admin-reservation-total__label">Total estimado</span>
                  <small>El total definitivo lo recalcula Supabase al guardar.</small>
                </div>
                <strong className="admin-reservation-total__amount" aria-live="polite">{money(manualTotalPreview)}</strong>
              </div>
            </div>
          </div>
          <footer className="admin-modal-footer">
            <button className="admin-btn" type="submit" disabled={manualSaving || catalogLoading}>
              {manualSaving ? <Loader2 className="animate-spin" size={15} /> : null}
              Crear
            </button>
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setManualOpen(false)}>Cancelar</button>
          </footer>
        </form>
      </Modal>
      <Modal open={editOpen} onClose={() => setEditOpen(false)} titleId="edit-booking-title" className="admin-reservation-modal">
        <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
          <header className="admin-modal-header">
            <div>
              <h2 id="edit-booking-title" className="admin-card__title">Editar reserva</h2>
              <p className="admin-muted">Guardar no confirma ni vuelve a enviar el correo.</p>
            </div>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditOpen(false)}><X size={18} /></button>
          </header>
          {editForm ? <div className="admin-modal-body"><div className="admin-form-section"><div className="admin-form-columns">
            <label className="admin-field"><span className="admin-field__label">Nombre del cliente</span><input className="admin-input" required value={editForm.fullName} onChange={(event) => updateEditForm('fullName', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Email</span><input className="admin-input" type="email" value={editForm.email} onChange={(event) => updateEditForm('email', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">WhatsApp</span><input className="admin-input" required value={editForm.whatsapp} onChange={(event) => updateEditForm('whatsapp', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Tour / paquete</span><select className="admin-select" required value={editForm.tourPackageId} onChange={(event) => updateEditForm('tourPackageId', event.target.value)}>{tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.tourTitle ?? tour.name} - {tour.name}</option>)}</select></label>
            <label className="admin-field"><span className="admin-field__label">Fecha</span><input className="admin-input" required type="date" value={editForm.tourDate} onChange={(event) => updateEditForm('tourDate', event.target.value)} /></label>
            <label className="admin-field"><span className="admin-field__label">Hora</span><select className="admin-select" required value={editForm.timeSlotId} onChange={(event) => updateEditForm('timeSlotId', event.target.value)}>{editTimeSlots.map((slot) => <option key={slot.id} value={slot.id}>{formatTime(slot.time)}</option>)}</select></label>
            <label className="admin-field"><span className="admin-field__label">Personas</span><input className="admin-input" required type="number" min={1} value={editForm.guests} onChange={(event) => updateEditForm('guests', Number(event.target.value))} /></label>
            <label className="admin-field admin-field--wide"><span className="admin-field__label">Notas</span><textarea className="admin-input admin-textarea-list" value={editForm.specialRequests} onChange={(event) => updateEditForm('specialRequests', event.target.value)} /></label>
          </div></div>
          {editingReservation && editingReservation.booking_status !== 'cancelled' ? (
            <div className="admin-form-section">
              <header className="admin-form-section__head">
                <span className="admin-form-section__icon"><Trash2 size={16} /></span>
                <div>
                  <h3 className="admin-form-section__title">Zona de peligro</h3>
                  <p className="admin-form-section__description">Esta acción no se puede deshacer.</p>
                </div>
              </header>
              <div className="admin-form-section__fields">
                <div className="admin-danger-zone">
                  <p className="admin-muted">Cancela esta reserva. El bloqueo de disponibilidad del bote se libera.</p>
                  <button className="admin-btn admin-btn--danger" type="button" onClick={() => setCancelConfirmOpen(true)}>
                    <Trash2 size={15} /> Cancelar reserva
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          </div> : null}
          <footer className="admin-modal-footer"><button className="admin-btn" type="submit" disabled={editSaving || !editForm}>{editSaving ? 'Guardando...' : 'Guardar'}</button><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditOpen(false)}>Cancelar</button></footer>
        </form>
      </Modal>

      <AdminConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        titleId="confirm-booking-title"
        title="Confirmar reserva"
        tone="primary"
        confirmLabel="Confirmar"
        loading={Boolean(confirmTarget) && busyId === confirmTarget?.id}
        message={
          <>
            <p>¿Confirmar esta reserva{confirmTarget ? <> <strong>{confirmTarget.booking_reference}</strong></> : null}?</p>
            <p className="mt-2">Se marcará como pagada, se bloqueará el bote y se enviará el correo de confirmación si el cliente tiene email.</p>
          </>
        }
        onConfirm={async () => {
          if (!confirmTarget) return;
          await updateReservationStatus(confirmTarget, 'confirmed');
          setConfirmTarget(null);
        }}
      />

      <Modal open={cancelConfirmOpen} onClose={() => setCancelConfirmOpen(false)} titleId="cancel-booking-title" className="max-w-md">
        <div className="admin-modal-card">
          <h2 id="cancel-booking-title" className="admin-card__title"><Trash2 size={18} /> Cancelar reserva</h2>
          <p className="admin-muted mt-2">¿Cancelar esta reserva? Esta acción cambiará el estado de la reserva y puede afectar la disponibilidad.</p>
          <div className="admin-actions mt-5">
            <button
              className="admin-btn admin-btn--danger"
              type="button"
              disabled={busyId === editingReservation?.id}
              onClick={() => {
                if (!editingReservation) return;
                void updateReservationStatus(editingReservation, 'cancelled').then(() => {
                  setCancelConfirmOpen(false);
                  setEditOpen(false);
                });
              }}
            >
              {busyId === editingReservation?.id ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} Sí, cancelar reserva
            </button>
            <button className="admin-btn admin-btn--secondary" type="button" disabled={busyId === editingReservation?.id} onClick={() => setCancelConfirmOpen(false)}>Volver</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
