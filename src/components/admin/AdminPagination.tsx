import { useEffect, useRef, useState } from 'react';
import { ADMIN_PAGE_SIZE_OPTIONS, clampAdminPage, getAdminPageCount, getAdminPaginationItems } from './adminPaginationItems';

export interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  loading?: boolean;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const COMPACT_QUERY = '(max-width: 520px)';

function useCompactPagination() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(COMPACT_QUERY).matches === true);
  useEffect(() => {
    const query = window.matchMedia?.(COMPACT_QUERY);
    if (!query) return undefined;
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}

/** Shared Admin paginator: « ‹ 1 2 3 … 8 9 10 › » plus the rows-per-page select. */
export default function AdminPagination({ page, pageSize, total, noun, loading, pageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS, onPageChange, onPageSizeChange }: AdminPaginationProps) {
  const compact = useCompactPagination();
  const pages = getAdminPageCount(total, pageSize);
  const current = clampAdminPage(page, pages);
  const start = total === 0 ? 0 : Math.min(total, (current - 1) * pageSize + 1);
  const end = Math.min(current * pageSize, total);
  const items = getAdminPaginationItems(current, pages, compact ? 0 : 1);
  const options = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize].sort((a, b) => a - b);
  const navRef = useRef<HTMLElement>(null);
  const sizeRef = useRef<HTMLSelectElement>(null);
  const restoreFocus = useRef<string | null>(null);

  // Buttons are disabled while a page loads and at the first/last page; without this a keyboard user who just
  // activated one of them would be dropped back onto <body>.
  useEffect(() => {
    if (!restoreFocus.current || loading) return;
    const control = restoreFocus.current;
    restoreFocus.current = null;
    const active = document.activeElement as HTMLElement | null;
    const lost = !active || active === document.body || (active as HTMLButtonElement).disabled === true;
    if (!lost) return;
    if (control === 'size') sizeRef.current?.focus();
    else (navRef.current?.querySelector<HTMLElement>(`[data-pagination-control="${control}"]:not(:disabled)`) ?? navRef.current?.querySelector<HTMLElement>('[aria-current="page"]'))?.focus();
  }, [loading, current, pageSize]);

  function goTo(next: number, control: string) {
    const target = clampAdminPage(next, pages);
    if (loading || target === current) return;
    restoreFocus.current = control;
    onPageChange(target);
  }

  const boundary = (control: string, label: string, symbol: string, target: number, disabled: boolean) => (
    <button type="button" className="admin-btn admin-btn--secondary admin-pagination__button" aria-label={label} title={label} data-pagination-control={control} disabled={loading || disabled} onClick={() => goTo(target, control)}>
      <span aria-hidden="true">{symbol}</span>
    </button>
  );

  return (
    <nav ref={navRef} className="admin-pagination" aria-label={`Paginación de ${noun}`} aria-busy={loading}>
      <p className="admin-pagination__summary" aria-live="polite">{`Mostrando ${start}–${end} de ${total} ${noun}`}</p>
      <label className="admin-pagination__size">
        Registros por página
        <select
          ref={sizeRef}
          className="admin-select"
          value={pageSize}
          disabled={loading}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (!Number.isFinite(size) || size <= 0 || size === pageSize) return;
            restoreFocus.current = 'size';
            onPageSizeChange(size);
          }}
        >
          {options.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="admin-pagination__controls">
        {boundary('first', 'Primera página', '«', 1, current <= 1)}
        {boundary('prev', 'Página anterior', '‹', current - 1, current <= 1)}
        {items.map((item) => typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            className={`admin-btn admin-btn--secondary admin-pagination__button admin-pagination__page${item === current ? ' is-current' : ''}`}
            aria-label={item === current ? `Página ${item} de ${pages}, página actual` : `Ir a la página ${item}`}
            title={`Página ${item}`}
            aria-current={item === current ? 'page' : undefined}
            data-pagination-control={`page-${item}`}
            disabled={loading && item !== current}
            onClick={() => goTo(item, `page-${item}`)}
          >
            {item}
          </button>
        ) : <span key={item} className="admin-pagination__ellipsis" aria-hidden="true">…</span>)}
        {boundary('next', 'Página siguiente', '›', current + 1, current >= pages)}
        {boundary('last', 'Última página', '»', pages, current >= pages)}
      </div>
    </nav>
  );
}
