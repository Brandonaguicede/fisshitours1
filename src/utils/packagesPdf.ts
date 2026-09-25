// "Resumen de paquetes" -> PDF. A4 landscape, brand header (logo on the deep-ocean band), generation date, the active
// filters, a clean striped table and "Página X de Y" footers. jsPDF is loaded on demand (only when the admin exports),
// so it never weighs on the normal admin bundle.

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

// Same palette as the admin: --admin-ink / --admin-primary-dark / --admin-primary / --admin-primary-soft.
const INK: [number, number, number] = [11, 40, 66];
const PRIMARY: [number, number, number] = [43, 95, 130];
const SOFT: [number, number, number] = [242, 250, 253];
const LINE: [number, number, number] = [208, 226, 236];
const MUTED: [number, number, number] = [96, 122, 143];
const GREEN: [number, number, number] = [22, 128, 76];
const GRAY: [number, number, number] = [130, 143, 156];
const BRAND = 'Papagayo Fishing Tour';

export async function createPackagesPdf(input: PackagePdfInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: input.compress !== false });
  const page = { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
  const margin = 14;
  const generatedAt = input.generatedAt ?? new Date();
  const stamp = new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeStyle: 'short' }).format(generatedAt);

  doc.setProperties({ title: 'Resumen de paquetes', subject: `${BRAND} - Resumen de paquetes`, author: BRAND, creator: BRAND });

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
  doc.text('Resumen de paquetes', titleX, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(159, 208, 238);
  doc.text(hasLogo ? 'Botes · Tours · Precios y capacidad' : `${BRAND} · Botes · Tours · Precios y capacidad`, titleX, 24);
  doc.setFontSize(9);
  doc.setTextColor(214, 232, 244);
  doc.text(`Generado el ${stamp}`, page.width - margin, 15, { align: 'right' });
  doc.text(`${input.rows.length} ${input.rows.length === 1 ? 'paquete' : 'paquetes'}`, page.width - margin, 21, { align: 'right' });

  // ---- filters summary
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('FILTROS', margin, 40);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  const filterText = input.filters.length ? input.filters.join('   ·   ') : 'Sin filtros: se incluyen todos los paquetes.';
  doc.text(doc.splitTextToSize(filterText, page.width - margin * 2 - 22), margin + 22, 40);

  if (input.rows.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(11);
    doc.text('No hay paquetes para los filtros seleccionados.', margin, 58);
  } else {
    autoTable(doc, {
      startY: 46,
      margin: { left: margin, right: margin, top: 20, bottom: 16 },
      theme: 'plain',
      head: [['Paquete', 'Bote', 'Tour', 'Precio base', 'Incluidos / máx.', 'Duración', 'Estado']],
      body: input.rows.map((row) => [row.name, row.boat, row.tour, row.price, row.capacity, row.duration, row.status]),
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: SOFT },
      columnStyles: {
        0: { cellWidth: 69, fontStyle: 'bold' },
        1: { cellWidth: 40 },
        2: { cellWidth: 52 },
        3: { cellWidth: 26, halign: 'right' },
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
        // Continuation pages get a slim brand band; the first page already has the full header.
        if (data.pageNumber > 1) {
          band(13);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text('Resumen de paquetes', margin, 8.5);
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

export async function loadLogoDataUrl(url = '/images/papagayo-logo.png'): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    // 1659x948 is far more than a 40 mm logo needs: 520 px wide (transparent PNG) keeps the PDF small and crisp.
    const width = Math.min(520, bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((bitmap.height / bitmap.width) * width);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function packagesPdfFileName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `resumen-de-paquetes-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
}
