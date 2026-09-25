// "Reservas" -> PDF. Same visual language as the "Resumen de paquetes" PDF (packagesPdf.ts): both draw the header,
// filters, continuation band, footer and table look from exportBrand.ts — A4 landscape, brand band with the white logo,
// generation date/time, the active filters, a striped table and "Página X de Y" footers. jsPDF is loaded on demand
// (only when the admin exports), so it never weighs on the normal admin bundle.

import { AMBER, BRAND, drawPdfContinuationBand, drawPdfEmptyState, drawPdfFooters, drawPdfHeader, formatUsd, GRAY, GREEN, pdfTableLook, RED } from './exportBrand';
import { formatTourDate, type ReservationExportRow } from './reservationsExport';

export interface ReservationsPdfInput {
  rows: ReservationExportRow[];
  /** Human-readable active filters, e.g. ["Estado de reserva: Confirmada"]. Empty = no filters. */
  filters: string[];
  generatedAt?: Date;
  /** PNG data URL of the (white) brand logo; the PDF falls back to the text brand when missing. */
  logoDataUrl?: string | null;
  /** Off only in tests, so the page content can be inspected as plain text. */
  compress?: boolean;
}

const TITLE = 'Reporte de reservas';

function statusColor(text: string): [number, number, number] {
  const value = text.toLowerCase();
  if (/(pagad|confirmad|completad)/.test(value)) return GREEN;
  if (/(cancelad|fallid|reembols)/.test(value)) return RED;
  if (/(pendiente|por confirmar|procesando|en tour)/.test(value)) return AMBER;
  return GRAY;
}

export async function createReservationsPdf(input: ReservationsPdfInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: input.compress !== false });

  doc.setProperties({ title: TITLE, subject: `${BRAND} - Reservas`, author: BRAND, creator: BRAND });

  drawPdfHeader(doc, {
    title: TITLE,
    subtitle: 'Clientes · Fechas · Pagos · Estados · Montos en USD',
    countLabel: `${input.rows.length} ${input.rows.length === 1 ? 'reserva' : 'reservas'}`,
    generatedAt: input.generatedAt ?? new Date(),
    logoDataUrl: input.logoDataUrl,
    filters: input.filters,
    noFiltersText: 'Sin filtros: se incluyen todas las reservas.',
  });

  if (input.rows.length === 0) {
    drawPdfEmptyState(doc, 'No hay reservas para los filtros seleccionados.');
  } else {
    autoTable(doc, {
      ...pdfTableLook({ fontSize: 8.5, padding: 2.6 }),
      startY: 46,
      head: [['Referencia', 'Cliente', 'Fecha y hora', 'Bote / Tour', 'Pers.', 'Salida', 'Total (USD)', 'Pago', 'Estado']],
      body: input.rows.map((row) => [
        row.reference,
        [row.customer || '-', row.whatsapp].filter(Boolean).join('\n'),
        [formatTourDate(row.tourDate), row.time].filter(Boolean).join('\n'),
        [row.boat || '-', row.tour].filter(Boolean).join('\n'),
        String(row.guests),
        row.departure || '-',
        formatUsd(row.total),
        `${row.paymentMethod}\n${row.paymentStatus}`,
        row.bookingStatus,
      ]),
      columnStyles: {
        0: { cellWidth: 25, fontStyle: 'bold' },
        1: { cellWidth: 42 },
        2: { cellWidth: 26 },
        3: { cellWidth: 50 },
        4: { cellWidth: 13, halign: 'center' },
        5: { cellWidth: 34 },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 30 },
        8: { cellWidth: 25, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index === 4) data.cell.styles.halign = 'center';
        if (data.section === 'head' && data.column.index === 6) data.cell.styles.halign = 'right';
        if (data.section === 'head' && data.column.index === 8) data.cell.styles.halign = 'center';
        if (data.section === 'body' && data.column.index === 8) {
          data.cell.styles.textColor = statusColor(String(data.cell.raw));
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body' && data.column.index === 6) data.cell.styles.fontStyle = 'bold';
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawPdfContinuationBand(doc, TITLE);
      },
    });
  }

  drawPdfFooters(doc);
  return doc;
}
