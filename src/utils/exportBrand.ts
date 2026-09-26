// One brand for every Admin export ("Resumen de paquetes" PDF, "Reservas" PDF and .xlsx): the same name, logo,
// palette, generation stamp, USD wording, PDF header / continuation band / footer and table look live here, so the
// three files read as one family instead of three near-copies. Display-only: nothing here changes what is exported.
// jsPDF is only referenced as a type, so it stays out of the normal admin bundle (it is loaded on demand by the callers).

import type { jsPDF } from 'jspdf';

export const BRAND = 'Papagayo Fishing Tour';
export const LOGO_PATH = '/images/papagayo-logo.png';
/** Natural size of public/images/papagayo-logo.png (1659 x 948); keeps the logo undistorted in PDF and XLSX. */
export const LOGO_ASPECT = 1659 / 948;

type Rgb = [number, number, number];

// Same palette as the admin: --admin-ink / --admin-primary-dark / --admin-primary / --admin-primary-soft.
export const INK: Rgb = [11, 40, 66];
export const PRIMARY: Rgb = [43, 95, 130];
export const SOFT: Rgb = [242, 250, 253];
export const LINE: Rgb = [208, 226, 236];
export const MUTED: Rgb = [96, 122, 143];
export const GREEN: Rgb = [22, 128, 76];
export const GRAY: Rgb = [130, 143, 156];
export const AMBER: Rgb = [154, 103, 0];
export const RED: Rgb = [180, 35, 24];
const BAND_SUBTITLE: Rgb = [159, 208, 238];
const BAND_META: Rgb = [214, 232, 244];

/** The same colours as an Excel ARGB string (opaque). */
export const argb = ([r, g, b]: Rgb) => `FF${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** "24 de septiembre de 2026, 20:41" — identical wording in the PDFs and the workbook. */
export function formatGeneratedStamp(date: Date) {
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** Every amount in an export is USD with cents ("$1,250.00"), whatever the file. */
export const formatUsd = (value: number) => usd.format(value);

/** PNG data URL of the (white, transparent) brand logo scaled to 520 px, or null if it cannot be loaded. */
export async function loadLogoDataUrl(url = LOGO_PATH): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    // 1659x948 is far more than a 40 mm logo needs: 520 px wide (transparent PNG) keeps the file small and crisp.
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

// ---- PDF ------------------------------------------------------------------------------------------------------

export const PDF_MARGIN = 14;

const setColor = (doc: jsPDF, color: Rgb) => doc.setTextColor(color[0], color[1], color[2]);

function band(doc: jsPDF, height: number) {
  doc.setFillColor(INK[0], INK[1], INK[2]);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), height, 'F');
}

export interface PdfHeaderInput {
  title: string;
  /** What the table lists, e.g. "Botes · Tours · Precios y capacidad". The brand name is prepended when there is no logo. */
  subtitle: string;
  /** e.g. "45 paquetes". */
  countLabel: string;
  generatedAt: Date;
  logoDataUrl?: string | null;
  filters: string[];
  /** Text shown when no filter is active, e.g. "Sin filtros: se incluyen todos los paquetes." */
  noFiltersText: string;
}

/** First-page header: brand band with logo, title, subtitle, generation date and count, then the FILTROS summary. */
export function drawPdfHeader(doc: jsPDF, input: PdfHeaderInput) {
  const pageWidth = doc.internal.pageSize.getWidth();
  band(doc, 32);
  let hasLogo = false;
  if (input.logoDataUrl) {
    try { doc.addImage(input.logoDataUrl, 'PNG', PDF_MARGIN - 2, 4, 24 * LOGO_ASPECT, 24); hasLogo = true; } catch { hasLogo = false; }
  }
  const titleX = hasLogo ? PDF_MARGIN + 40 : PDF_MARGIN;
  setColor(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(input.title, titleX, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setColor(doc, BAND_SUBTITLE);
  doc.text(hasLogo ? input.subtitle : `${BRAND} · ${input.subtitle}`, titleX, 24);
  doc.setFontSize(9);
  setColor(doc, BAND_META);
  doc.text(`Generado el ${formatGeneratedStamp(input.generatedAt)}`, pageWidth - PDF_MARGIN, 15, { align: 'right' });
  doc.text(input.countLabel, pageWidth - PDF_MARGIN, 21, { align: 'right' });

  setColor(doc, MUTED);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('FILTROS', PDF_MARGIN, 40);
  doc.setFont('helvetica', 'normal');
  setColor(doc, INK);
  doc.setFontSize(9.5);
  const filterText = input.filters.length ? input.filters.join('   ·   ') : input.noFiltersText;
  doc.text(doc.splitTextToSize(filterText, pageWidth - PDF_MARGIN * 2 - 22), PDF_MARGIN + 22, 40);
}

/** Continuation pages get a slim brand band; the first page already has the full header. */
export function drawPdfContinuationBand(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  band(doc, 13);
  setColor(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, PDF_MARGIN, 8.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setColor(doc, BAND_SUBTITLE);
  doc.text(BRAND, pageWidth - PDF_MARGIN, 8.5, { align: 'right' });
}

/** Shown instead of the table when nothing matches the filters. */
export function drawPdfEmptyState(doc: jsPDF, text: string) {
  setColor(doc, MUTED);
  doc.setFontSize(11);
  doc.text(text, PDF_MARGIN, 58);
}

/** "Papagayo Fishing Tour · Costa Rica" + "Página X de Y" on every page (needs the final page count). */
export function drawPdfFooters(doc: jsPDF) {
  const { width, height } = { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
  const total = doc.getNumberOfPages();
  for (let index = 1; index <= total; index += 1) {
    doc.setPage(index);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.3);
    doc.line(PDF_MARGIN, height - 11, width - PDF_MARGIN, height - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, MUTED);
    doc.text(`${BRAND} · Costa Rica`, PDF_MARGIN, height - 6);
    doc.text(`Página ${index} de ${total}`, width - PDF_MARGIN, height - 6, { align: 'right' });
  }
}

/** The table look shared by every PDF: plain theme, primary header, striped rows, thin row rules. */
export function pdfTableLook(options: { fontSize: number; padding: number }) {
  const { fontSize, padding } = options;
  return {
    theme: 'plain' as const,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, top: 20, bottom: 16 },
    styles: { font: 'helvetica', fontSize, textColor: INK, cellPadding: { top: padding, right: padding, bottom: padding, left: padding }, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'middle' as const, overflow: 'linebreak' as const },
    headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255] as Rgb, fontStyle: 'bold' as const, fontSize: 8.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: SOFT },
  };
}
