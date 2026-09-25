// "Reservas" -> PDF. Same visual language as the "Resumen de paquetes" PDF (packagesPdf.ts): A4 landscape, brand band with
// the white logo, generation date/time, the active filters, a striped table and "Página X de Y" footers. jsPDF is loaded
// on demand (only when the admin exports), so it never weighs on the normal admin bundle.

import { BRAND, GRAY, GREEN, INK, LINE, MUTED, PRIMARY, SOFT } from './packagesPdf';
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

const AMBER: [number, number, number] = [154, 103, 0];
const RED: [number, number, number] = [180, 35, 24];
const TITLE = 'Reporte de reservas';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
  const page = { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
  const margin = 14;
  const generatedAt = input.generatedAt ?? new Date();
  const stamp = new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeStyle: 'short' }).format(generatedAt);

  doc.setProperties({ title: TITLE, subject: `${BRAND} - Reservas`, author: BRAND, creator: BRAND });

  const band = (height: number) => { doc.setFillColor(...INK); doc.rect(0, 0, page.width, height, 'F'); };
  const logo = (x: number, y: number, h: number) => {
    if (!input.logoDataUrl) return false;
    try { doc.addImage(input.logoDataUrl, 'PNG', x, y, h * (1659 / 948), h); return true; } catch { return false; }
  };

  // ---- first page header
  band(32);
  const hasLogo = logo(margin - 2, 4, 24);
  const titleX = hasLogo ? margin + 40 : margin;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(TITLE, titleX, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(159, 208, 238);
  doc.text(hasLogo ? 'Clientes · Fechas · Pagos · Estados · Montos en USD' : `${BRAND} · Clientes · Fechas · Pagos · Estados · Montos en USD`, titleX, 24);
  doc.setFontSize(9);
  doc.setTextColor(214, 232, 244);
  doc.text(`Generado el ${stamp}`, page.width - margin, 15, { align: 'right' });
  doc.text(`${input.rows.length} ${input.rows.length === 1 ? 'reserva' : 'reservas'}`, page.width - margin, 21, { align: 'right' });

  // ---- filters summary
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('FILTROS', margin, 40);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  const filterText = input.filters.length ? input.filters.join('   ·   ') : 'Sin filtros: se incluyen todas las reservas.';
  doc.text(doc.splitTextToSize(filterText, page.width - margin * 2 - 22), margin + 22, 40);

  if (input.rows.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(11);
    doc.text('No hay reservas para los filtros seleccionados.', margin, 58);
  } else {
    autoTable(doc, {
      startY: 46,
      margin: { left: margin, right: margin, top: 20, bottom: 16 },
      theme: 'plain',
      head: [['Referencia', 'Cliente', 'Fecha y hora', 'Bote / Tour', 'Pers.', 'Salida', 'Total (USD)', 'Pago', 'Estado']],
      body: input.rows.map((row) => [
        row.reference,
        [row.customer || '-', row.whatsapp].filter(Boolean).join('\n'),
        [formatTourDate(row.tourDate), row.time].filter(Boolean).join('\n'),
        [row.boat || '-', row.tour].filter(Boolean).join('\n'),
        String(row.guests),
        row.departure || '-',
        usd.format(row.total),
        `${row.paymentMethod}\n${row.paymentStatus}`,
        row.bookingStatus,
      ]),
      styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: { top: 2.6, right: 2.5, bottom: 2.6, left: 2.5 }, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: SOFT },
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
        // Continuation pages get a slim brand band; the first page already has the full header.
        if (data.pageNumber > 1) {
          band(13);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(TITLE, margin, 8.5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(159, 208, 238);
          doc.text(BRAND, page.width - margin, 8.5, { align: 'right' });
        }
      },
    });
  }

  // ---- footer on every page (needs the final page count)
  const total = doc.getNumberOfPages();
  for (let index = 1; index <= total; index += 1) {
    doc.setPage(index);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, page.height - 11, page.width - margin, page.height - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${BRAND} · Costa Rica`, margin, page.height - 6);
    doc.text(`Página ${index} de ${total}`, page.width - margin, page.height - 6, { align: 'right' });
  }
  return doc;
}
