// "Resumen de paquetes" -> PDF. A4 landscape, brand header (logo on the deep-ocean band), generation date, the active
// filters, a clean striped table and "Página X de Y" footers. The brand pieces (header, band, footer, table look, USD
// wording) are shared with the Reservas exports through exportBrand.ts. jsPDF is loaded on demand (only when the admin
// exports), so it never weighs on the normal admin bundle.

import { BRAND, drawPdfContinuationBand, drawPdfEmptyState, drawPdfFooters, drawPdfHeader, GRAY, GREEN, pdfTableLook } from './exportBrand';

export { loadLogoDataUrl } from './exportBrand';

export interface PackagePdfRow {
  name: string;
  boat: string;
  tour: string;
  price: string;
  capacity: string;
  duration: string;
  status: 'Activo' | 'Inactivo';
}

export interface PackagePdfInput {
  rows: PackagePdfRow[];
  /** Human-readable active filters, e.g. ["Bote: Second Wind", "Estado: Activos"]. Empty = no filters. */
  filters: string[];
  generatedAt?: Date;
  /** PNG data URL of the (white) brand logo; the PDF falls back to the text brand when missing. */
  logoDataUrl?: string | null;
  /** Off only in tests, so the page content can be inspected as plain text. */
  compress?: boolean;
}

export async function createPackagesPdf(input: PackagePdfInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: input.compress !== false });

  doc.setProperties({ title: 'Resumen de paquetes', subject: `${BRAND} - Resumen de paquetes`, author: BRAND, creator: BRAND });

  drawPdfHeader(doc, {
    title: 'Resumen de paquetes',
    subtitle: 'Botes · Tours · Precios y capacidad · Montos en USD',
    countLabel: `${input.rows.length} ${input.rows.length === 1 ? 'paquete' : 'paquetes'}`,
    generatedAt: input.generatedAt ?? new Date(),
    logoDataUrl: input.logoDataUrl,
    filters: input.filters,
    noFiltersText: 'Sin filtros: se incluyen todos los paquetes.',
  });

  if (input.rows.length === 0) {
    drawPdfEmptyState(doc, 'No hay paquetes para los filtros seleccionados.');
  } else {
    autoTable(doc, {
      ...pdfTableLook({ fontSize: 9, padding: 3 }),
      startY: 46,
      head: [['Paquete', 'Bote', 'Tour', 'Precio base (USD)', 'Incluidos / máx.', 'Duración', 'Estado']],
      body: input.rows.map((row) => [row.name, row.boat, row.tour, row.price, row.capacity, row.duration, row.status]),
      columnStyles: {
        0: { cellWidth: 65, fontStyle: 'bold' },
        1: { cellWidth: 40 },
        2: { cellWidth: 50 },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'center' },
        5: { cellWidth: 26, halign: 'center' },
        6: { cellWidth: 24, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'head' && [3].includes(data.column.index)) data.cell.styles.halign = 'right';
        if (data.section === 'head' && [4, 5, 6].includes(data.column.index)) data.cell.styles.halign = 'center';
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = data.cell.raw === 'Activo' ? GREEN : GRAY;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawPdfContinuationBand(doc, 'Resumen de paquetes');
      },
    });
  }

  drawPdfFooters(doc);
  return doc;
}

export function packagesPdfFileName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `resumen-de-paquetes-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
}
