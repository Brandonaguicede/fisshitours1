// Reservas: shared model for the list, the exports (.xlsx / PDF) and the KPI cards. Display-only — nothing here
// touches booking, payment, availability or pricing logic; it only turns the rows the admin already loads into
// readable labels, an Excel workbook and counts. exceljs is loaded on demand (only when the admin exports). The workbook
// takes its brand (name, palette, logo, generation stamp) from exportBrand.ts, like the PDFs. NOTE: brand values are only
// touched inside functions — tests load this file alone in a vm context where imports are stripped.

import { AMBER, argb, BRAND, GREEN, INK, LINE, LOGO_ASPECT, formatGeneratedStamp, PRIMARY, RED, SOFT } from './exportBrand';

export interface AdminReservation {
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

export interface ReservationFilterValues {
  search: string;
  bookingStatus: string;
  paymentStatus: string;
  date: string;
}

// ---- labels ---------------------------------------------------------------------------------------------------

/** Single source for the "Estado de pago" wording: the filter, the table/cards and both exports read it. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Pagado',
  pending: 'Pendiente',
  processing: 'Procesando',
  not_required_yet: 'Pago en tour',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};

/** Singular wording for a single reservation (exports); the filter dropdown keeps its own plural options. */
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmada',
  pending_payment: 'Pago pendiente',
  pending_confirmation: 'Por confirmar',
  pending: 'Pendiente',
  cancelled: 'Cancelada',
  completed: 'Completada',
};

export function formatPaymentStatusLabel(status: string) {
  return PAYMENT_STATUS_LABELS[status] ?? status.split('_').join(' ');
}

export function formatBookingStatusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status] ?? status.split('_').join(' ');
}

export function formatPaymentMethodLabel(key: string, name: string) {
  const source = `${key} ${name}`.toLowerCase();
  if (source.includes('paypal')) return 'PayPal';
  if (source.includes('whatsapp')) return 'WhatsApp';
  if (/pay[\s_-]*on[\s_-]*(the[\s_-]*)?day|pago[\s_-]*(el[\s_-]*)?d[ií]a/.test(source)) return 'Día del tour';
  return name;
}

// ---- KPI cards ------------------------------------------------------------------------------------------------

// `pending` is the legacy status the bookings check constraint still allows; the other two are the live ones.
export const PENDING_BOOKING_STATUSES = ['pending', 'pending_payment', 'pending_confirmation'];

export interface ReservationStats {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
}

/**
 * Counts bookings by their own `booking_status`: Reservas = every row; Pendientes = `pending` + `pending_payment` +
 * `pending_confirmation`; Confirmadas = `confirmed`; Canceladas = `cancelled`. There is no card for `completed`, so
 * the three status cards do not necessarily add up to `total`.
 */
export function computeReservationStats(rows: Array<{ booking_status: string }>): ReservationStats {
  const count = (statuses: string[]) => rows.filter((row) => statuses.includes(row.booking_status)).length;
  return {
    total: rows.length,
    pending: count(PENDING_BOOKING_STATUSES),
    confirmed: count(['confirmed']),
    cancelled: count(['cancelled']),
  };
}

/**
 * Reads every booking status, page by page. PostgREST silently caps a plain select at 1000 rows, which would
 * under-count the cards once the business has more bookings than that.
 */
export async function loadAllBookingStatuses(loadRange: (from: number, to: number) => Promise<Array<{ booking_status: string }> | null>, size = 1000) {
  const rows: Array<{ booking_status: string }> = [];
  for (let from = 0; from < 1_000_000; from += size) {
    const batch = (await loadRange(from, from + size - 1)) ?? [];
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return rows;
}

// ---- export rows ----------------------------------------------------------------------------------------------

export interface ReservationExportRow {
  reference: string;
  /** YYYY-MM-DD */
  tourDate: string;
  time: string;
  customer: string;
  email: string;
  whatsapp: string;
  boat: string;
  tour: string;
  guests: number;
  departure: string;
  departureSurcharge: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  bookingStatus: string;
  notes: string;
  /** ISO timestamp */
  createdAt: string;
}

/** Keeps the list's own order (tour date ascending, newest booking first) and drops rows repeated across pages. */
export function buildReservationExportRows(reservations: AdminReservation[], paymentMethodName: (key: string) => string = (key) => key): ReservationExportRow[] {
  const seen = new Set<string>();
  const rows: ReservationExportRow[] = [];
  for (const reservation of reservations) {
    if (seen.has(reservation.id)) continue;
    seen.add(reservation.id);
    rows.push({
      reference: reservation.booking_reference,
      tourDate: reservation.tour_date,
      time: reservation.time_slots?.label ?? '',
      customer: reservation.customers?.full_name ?? '',
      email: reservation.customers?.email ?? '',
      whatsapp: reservation.customers?.whatsapp ?? '',
      boat: reservation.boats?.name ?? '',
      tour: reservation.tours?.title ?? '',
      guests: Number(reservation.guests),
      departure: reservation.departure_location_name_snapshot ?? '',
      departureSurcharge: Number(reservation.departure_surcharge_snapshot ?? 0),
      total: Number(reservation.total_snapshot ?? 0),
      paymentMethod: formatPaymentMethodLabel(reservation.payment_method_key, paymentMethodName(reservation.payment_method_key)),
      paymentStatus: formatPaymentStatusLabel(reservation.payment_status),
      bookingStatus: formatBookingStatusLabel(reservation.booking_status),
      notes: reservation.special_requests ?? '',
      createdAt: reservation.created_at,
    });
  }
  return rows;
}

/** Every page of the current search + filters (not only the visible one), in the list's order. */
export async function fetchAllReservations(fetchPage: (page: number, size: number) => Promise<{ rows: AdminReservation[]; total: number }>, size = 50) {
  const all: AdminReservation[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page, size);
    all.push(...result.rows);
    if (all.length >= result.total || result.rows.length === 0) break;
  }
  return all;
}

// ---- formatting -----------------------------------------------------------------------------------------------

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' without going through Date (no timezone shift). */
export function formatTourDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatExportDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function activeReservationFilterLabels(filters: ReservationFilterValues) {
  const labels: string[] = [];
  if (filters.search.trim()) labels.push(`Búsqueda: "${filters.search.trim()}"`);
  if (filters.bookingStatus !== 'all') labels.push(`Estado de reserva: ${formatBookingStatusLabel(filters.bookingStatus)}`);
  if (filters.paymentStatus !== 'all') labels.push(`Estado de pago: ${formatPaymentStatusLabel(filters.paymentStatus)}`);
  if (filters.date) labels.push(`Fecha del tour: ${formatTourDate(filters.date)}`);
  return labels;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function reservationsFileName(extension: 'xlsx' | 'pdf', date = new Date()) {
  return `reservas-${localDay(date)}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking on the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- XLSX -----------------------------------------------------------------------------------------------------

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Same palette as the admin and both PDFs, as Excel wants it (ARGB). A function, not a constant: see the note above.
const brandArgb = () => ({ ink: argb(INK), primary: argb(PRIMARY), soft: argb(SOFT), line: argb(LINE), green: argb(GREEN), amber: argb(AMBER), red: argb(RED) });

type ColumnKind = 'text' | 'date' | 'datetime' | 'integer' | 'money';
interface ExportColumn {
  header: string;
  key: keyof ReservationExportRow;
  width: number;
  kind: ColumnKind;
}

/** Column order = reading order for whoever prepares the day: what/when first, then who, then money, then status. */
export const RESERVATION_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Referencia', key: 'reference', width: 16, kind: 'text' },
  { header: 'Fecha del tour', key: 'tourDate', width: 15, kind: 'date' },
  { header: 'Horario', key: 'time', width: 11, kind: 'text' },
  { header: 'Cliente', key: 'customer', width: 28, kind: 'text' },
  { header: 'Correo electrónico', key: 'email', width: 30, kind: 'text' },
  { header: 'WhatsApp', key: 'whatsapp', width: 17, kind: 'text' },
  { header: 'Bote', key: 'boat', width: 20, kind: 'text' },
  { header: 'Tour', key: 'tour', width: 32, kind: 'text' },
  { header: 'Personas', key: 'guests', width: 10, kind: 'integer' },
  { header: 'Lugar de salida', key: 'departure', width: 26, kind: 'text' },
  { header: 'Cargo de salida (USD)', key: 'departureSurcharge', width: 20, kind: 'money' },
  { header: 'Total (USD)', key: 'total', width: 14, kind: 'money' },
  { header: 'Método de pago', key: 'paymentMethod', width: 17, kind: 'text' },
  { header: 'Estado del pago', key: 'paymentStatus', width: 16, kind: 'text' },
  { header: 'Estado de la reserva', key: 'bookingStatus', width: 19, kind: 'text' },
  { header: 'Notas', key: 'notes', width: 40, kind: 'text' },
  { header: 'Creada el', key: 'createdAt', width: 18, kind: 'datetime' },
];

/** Excel dates carry no timezone: build the serial from the wall-clock parts so what the admin sees is what Excel shows. */
function excelDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value;
}

function excelDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));
}

function statusColor(text: string, ARGB: ReturnType<typeof brandArgb>) {
  const value = text.toLowerCase();
  if (/(pagad|confirmad|completad)/.test(value)) return ARGB.green;
  if (/(cancelad|fallid|reembols)/.test(value)) return ARGB.red;
  if (/(pendiente|por confirmar|procesando|en tour)/.test(value)) return ARGB.amber;
  return ARGB.ink;
}

export interface ReservationsXlsxInput {
  rows: ReservationExportRow[];
  /** Human-readable active filters. Empty = no filters. */
  filters: string[];
  generatedAt?: Date;
  /** PNG data URL of the (white) brand logo (see loadLogoDataUrl); the summary sheet just omits it when missing. */
  logoDataUrl?: string | null;
}

/** Builds a real OOXML workbook (a zip of XML parts — never CSV text with an .xlsx name). */
export async function createReservationsXlsx(input: ReservationsXlsxInput): Promise<Blob> {
  const module = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  const ExcelJS = module.default ?? module;
  const generatedAt = input.generatedAt ?? new Date();
  const ARGB = brandArgb();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND;
  workbook.lastModifiedBy = BRAND;
  workbook.title = 'Reporte de reservas';
  workbook.subject = `${BRAND} - Reservas`;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const sheet = workbook.addWorksheet('Reservas', {
    properties: { tabColor: { argb: ARGB.primary } },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${BRAND}&RPágina &P de &N` },
  });
  sheet.columns = RESERVATION_EXPORT_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));

  const header = sheet.getRow(1);
  header.height = 24;
  header.eachCell((cell, columnNumber) => {
    const kind = RESERVATION_EXPORT_COLUMNS[columnNumber - 1].kind;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.primary } };
    cell.alignment = { vertical: 'middle', horizontal: kind === 'money' || kind === 'integer' ? 'right' : 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: ARGB.ink } } };
  });

  input.rows.forEach((row, index) => {
    const excelRow = sheet.addRow(RESERVATION_EXPORT_COLUMNS.map((column) => {
      const value = row[column.key];
      if (column.kind === 'date') return excelDate(String(value));
      if (column.kind === 'datetime') return excelDateTime(String(value));
      return value;
    }));
    excelRow.height = 20;
    excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = RESERVATION_EXPORT_COLUMNS[columnNumber - 1];
      cell.font = { name: 'Calibri', size: 11, color: { argb: column.key === 'paymentStatus' || column.key === 'bookingStatus' ? statusColor(String(row[column.key]), ARGB) : ARGB.ink }, bold: column.key === 'reference' || column.key === 'paymentStatus' || column.key === 'bookingStatus' };
      cell.alignment = { vertical: 'middle', horizontal: column.kind === 'money' || column.kind === 'integer' ? 'right' : 'left', wrapText: column.key === 'notes' };
      cell.border = { bottom: { style: 'thin', color: { argb: ARGB.line } } };
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.soft } };
      if (column.kind === 'date') cell.numFmt = 'dd/mm/yyyy';
      if (column.kind === 'datetime') cell.numFmt = 'dd/mm/yyyy hh:mm';
      if (column.kind === 'money') cell.numFmt = '"$"#,##0.00';
      if (column.kind === 'integer') cell.numFmt = '0';
    });
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, input.rows.length + 1), column: RESERVATION_EXPORT_COLUMNS.length } };

  const summary = workbook.addWorksheet('Resumen', { properties: { tabColor: { argb: ARGB.ink } }, views: [{ showGridLines: false }] });
  summary.columns = [{ width: 26 }, { width: 70 }];
  summary.mergeCells('A1:B1');
  const title = summary.getCell('A1');
  title.value = 'Reporte de reservas';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB.ink } };
  title.alignment = { vertical: 'middle', indent: 1 };
  summary.getRow(1).height = 62;
  if (input.logoDataUrl) {
    // The same white logo as the PDFs, right-aligned on the dark title band (column B is ~495 px wide).
    const logoHeight = 60;
    const logoWidth = Math.round(logoHeight * LOGO_ASPECT);
    const imageId = workbook.addImage({ base64: input.logoDataUrl, extension: 'png' });
    summary.addImage(imageId, { tl: { col: 1 + (495 - logoWidth - 12) / 495, row: 0.02 }, ext: { width: logoWidth, height: logoHeight } });
  }
  const facts: Array<[string, string]> = [
    ['Empresa', BRAND],
    ['Generado el', formatGeneratedStamp(generatedAt)],
    ['Reservas incluidas', String(input.rows.length)],
    ['Moneda', 'USD (dólares estadounidenses)'],
    ['Filtros aplicados', input.filters.length ? input.filters.join('  ·  ') : 'Sin filtros: se incluyen todas las reservas.'],
  ];
  facts.forEach(([label, value], index) => {
    const row = summary.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: ARGB.primary } };
    row.getCell(2).value = value;
    row.getCell(2).font = { name: 'Calibri', size: 11, color: { argb: ARGB.ink } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { vertical: 'top' };
    row.getCell(1).border = row.getCell(2).border = { bottom: { style: 'thin', color: { argb: ARGB.line } } };
  });
  workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], { type: XLSX_MIME });
}
