import { Mail, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AdminBadge, AdminModuleSurface, AdminTable } from './AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { readWithAdminSession } from '../../services/adminAuthService';
import { buildLeadMailtoUrl, buildLeadWhatsAppUrl, classifyBookingLead, type BookingLeadRow, type BookingLeadState } from '../../utils/bookingLead';

const LEAD_COLUMNS = 'id, status, full_name, email, whatsapp, language, tour_date, guests, boat_name, tour_title, package_name, time_slot_label, booking_id, converted_at, created_at, updated_at, bookings(booking_reference)';
const LEAD_LIMIT = 200;

type LeadFilter = 'follow_up' | 'abandoned' | 'in_progress' | 'converted';
type LeadWithBooking = BookingLeadRow & { bookings?: { booking_reference: string } | null };

const FILTER_OPTIONS: Array<{ value: LeadFilter; label: string }> = [
  { value: 'follow_up', label: 'Por contactar (en proceso y abandonados)' },
  { value: 'abandoned', label: 'Posiblemente abandonados' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'converted', label: 'Convertidos' },
];

const STATE_BADGE: Record<BookingLeadState, string> = { in_progress: 'lead_in_progress', abandoned: 'lead_abandoned', converted: 'lead_converted' };

const formatActivity = (value: string) => new Date(value).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
const formatTourDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : null);

async function loadLeads(): Promise<LeadWithBooking[]> {
  // Open attempts first matter most, but the two groups are filtered client-side from one recent list so the abandonment rule (time based) stays in one place.
  const rows = await readWithAdminSession(() => (supabase as any)
    .from('booking_leads')
    .select(LEAD_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(LEAD_LIMIT)) as LeadWithBooking[] | null;
  return rows ?? [];
}

/** Read-only list of booking attempts: who left their contact data, what they were looking at, and a one-click way to reach them. */
export function AdminBookingLeadsSection() {
  const [filter, setFilter] = useState<LeadFilter>('follow_up');
  // "Posiblemente abandonado" depends on the clock: re-evaluate every minute without refetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const query = useQuery({ queryKey: ['admin', 'booking-leads'], queryFn: loadLeads, refetchInterval: 60_000 });
  const rows = useMemo(() => (query.data ?? []).map((lead) => ({ lead, state: classifyBookingLead(lead, now) })), [query.data, now]);
  const visible = rows.filter(({ state }) => filter === 'follow_up' ? state !== 'converted' : state === filter);
  const counts = useMemo(() => ({
    abandoned: rows.filter((row) => row.state === 'abandoned').length,
    in_progress: rows.filter((row) => row.state === 'in_progress').length,
  }), [rows]);

  return (
    <AdminModuleSurface className="admin-booking-leads">
      <div className="admin-toolbar-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
        <p className="admin-muted" style={{ margin: 0 }}>
          Personas que dejaron sus datos pero no completaron la reserva. {counts.abandoned} posiblemente abandonado{counts.abandoned === 1 ? '' : 's'} · {counts.in_progress} en proceso.
        </p>
        <label className="admin-field" style={{ minWidth: '16rem' }}>
          <span className="admin-field__label">Mostrar</span>
          <select className="admin-select" aria-label="Filtrar intentos de reserva" value={filter} onChange={(event) => setFilter(event.target.value as LeadFilter)}>
            {FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {query.isError ? (
        <div className="admin-alert admin-alert--danger" role="alert">
          {query.error instanceof Error ? query.error.message : 'No se pudieron cargar los intentos de reserva.'}
          <button className="admin-btn admin-btn--secondary" type="button" onClick={() => void query.refetch()}>Reintentar</button>
        </div>
      ) : null}
      {query.isLoading ? <p className="admin-muted" role="status">Cargando intentos de reserva...</p> : null}

      <div className="admin-reservations-table">
        <AdminTable embedded headers={['Cliente', 'Contacto', 'Tour y paquete', 'Fecha y horario', 'Última actividad', 'Estado', 'Acciones']}>
          {visible.map(({ lead, state }) => <LeadRow key={lead.id} lead={lead} state={state} />)}
          {!query.isLoading && !query.isError && visible.length === 0 ? (
            <tr><td colSpan={7} className="admin-muted">No hay intentos de reserva para este filtro.</td></tr>
          ) : null}
        </AdminTable>
      </div>
      <div className="admin-reservation-cards">
        {visible.map(({ lead, state }) => <LeadCard key={lead.id} lead={lead} state={state} />)}
        {!query.isLoading && !query.isError && visible.length === 0 ? <p className="admin-empty">No hay intentos de reserva para este filtro.</p> : null}
      </div>
      {(query.data?.length ?? 0) >= LEAD_LIMIT ? <p className="admin-muted">Se muestran los {LEAD_LIMIT} intentos más recientes.</p> : null}
    </AdminModuleSurface>
  );
}

function LeadActions({ lead }: { lead: LeadWithBooking }) {
  const mailto = buildLeadMailtoUrl(lead.email);
  const whatsapp = buildLeadWhatsAppUrl(lead);
  if (!mailto && !whatsapp) return <span className="admin-muted">—</span>;
  return (
    <div className="admin-row-actions">
      {mailto ? <a className="admin-action-btn" href={mailto} aria-label={`Escribir un correo a ${lead.full_name ?? 'el cliente'}`}><Mail size={14} /> Correo</a> : null}
      {whatsapp ? <a className="admin-action-btn" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Escribir por WhatsApp a ${lead.full_name ?? 'el cliente'}`}><MessageCircle size={14} /> WhatsApp</a> : null}
    </div>
  );
}

function LeadWhen({ lead }: { lead: LeadWithBooking }) {
  const date = formatTourDate(lead.tour_date);
  // Date, time and guests are only stored when the customer went through the step that shows them; otherwise they are simply not shown.
  if (!date && !lead.time_slot_label && !lead.guests) return <span className="admin-muted">—</span>;
  return (
    <>
      {date ?? <span className="admin-muted">—</span>}
      {lead.time_slot_label ? <div className="admin-muted">{lead.time_slot_label}</div> : null}
      {lead.guests ? <div className="admin-muted">{lead.guests} {lead.guests === 1 ? 'persona' : 'personas'}</div> : null}
    </>
  );
}

function LeadRow({ lead, state }: { lead: LeadWithBooking; state: BookingLeadState }) {
  const converted = state === 'converted';
  return (
    <tr>
      <td><div className="admin-table__truncate" title={lead.full_name ?? ''}>{converted ? <span className="admin-muted">Datos en la reserva</span> : lead.full_name}</div></td>
      <td>
        {converted ? (lead.bookings?.booking_reference ? <span>{lead.bookings.booking_reference}</span> : <span className="admin-muted">—</span>) : (
          <>
            <div className="admin-table__truncate" title={lead.email ?? ''}>{lead.email}</div>
            <div className="admin-muted admin-table__truncate" title={lead.whatsapp ?? ''}>{lead.whatsapp}</div>
          </>
        )}
      </td>
      <td>
        <div className="admin-table__truncate" title={lead.tour_title ?? ''}>{lead.tour_title ?? '—'}</div>
        <div className="admin-muted admin-table__truncate" title={lead.package_name ?? ''}>{lead.package_name ?? '—'}</div>
      </td>
      <td><LeadWhen lead={lead} /></td>
      <td>{formatActivity(lead.updated_at)}</td>
      <td style={{ minWidth: '12.5rem' }}><AdminBadge value={STATE_BADGE[state]} /></td>
      <td style={{ minWidth: '11rem' }}>{converted ? <span className="admin-muted">—</span> : <LeadActions lead={lead} />}</td>
    </tr>
  );
}

function LeadCard({ lead, state }: { lead: LeadWithBooking; state: BookingLeadState }) {
  const converted = state === 'converted';
  return (
    <article className="admin-reservation-card">
      <h2>{converted ? (lead.bookings?.booking_reference ?? 'Reserva') : lead.full_name}</h2>
      <dl>
        {converted ? null : <div><dt>Correo</dt><dd>{lead.email}</dd></div>}
        {converted ? null : <div><dt>WhatsApp</dt><dd>{lead.whatsapp}</dd></div>}
        <div><dt>Tour</dt><dd>{lead.tour_title ?? '—'}</dd></div>
        <div><dt>Paquete</dt><dd>{lead.package_name ?? '—'}</dd></div>
        <div><dt>Fecha y horario</dt><dd><LeadWhen lead={lead} /></dd></div>
        <div><dt>Última actividad</dt><dd>{formatActivity(lead.updated_at)}</dd></div>
        <div><dt>Estado</dt><dd><AdminBadge value={STATE_BADGE[state]} /></dd></div>
      </dl>
      {converted ? null : <LeadActions lead={lead} />}
    </article>
  );
}
