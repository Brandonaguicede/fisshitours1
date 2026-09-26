import { useEffect, useRef, useState } from 'react';
import { clampAdminPage, getAdminPageCount, getAdminPaginationItems } from './adminPaginationItems';

export interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
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

/**
 * Shared Admin paginator: `‹ 1 2 3 … 8 9 10 ›`, centered and compact. The page size is fixed (see ADMIN_PAGE_SIZE), so there is
 * no rows-per-page control, no results summary and no first/last jumps. The current position is still announced
 * to assistive tech through a visually hidden live region.
 */
export default function AdminPagination({ page, pageSize, total, noun, loading, onPageChange }: AdminPaginationProps) {
  const compact = useCompactPagination();
  const pages = getAdminPageCount(total, pageSize);
  const current = clampAdminPage(page, pages);
  const items = getAdminPaginationItems(current, pages, compact ? 0 : 1);
  const navRef = useRef<HTMLElement>(null);
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
    (navRef.current?.querySelector<HTMLElement>(`[data-pagination-control="${control}"]:not(:disabled)`) ?? navRef.current?.querySelector<HTMLElement>('[aria-current="page"]'))?.focus();
  }, [loading, current]);

  function goTo(next: number, control: string) {
    const target = clampAdminPage(next, pages);
    if (loading || target === current) return;
    restoreFocus.current = control;
    onPageChange(target);
  }

  const step = (control: string, label: string, symbol: string, target: number, disabled: boolean) => (
    <button type="button" className="admin-btn admin-btn--secondary admin-pagination__button" aria-label={label} title={label} data-pagination-control={control} disabled={loading || disabled} onClick={() => goTo(target, control)}>
      <span aria-hidden="true">{symbol}</span>
    </button>
  );

  return (
    <nav ref={navRef} className="admin-pagination" aria-label={`Paginación de ${noun}`} aria-busy={loading}>
      <span className="sr-only" aria-live="polite">{`Página ${current} de ${pages}`}</span>
      <div className="admin-pagination__controls">
        {step('prev', 'Página anterior', '‹', current - 1, current <= 1)}
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
        {step('next', 'Página siguiente', '›', current + 1, current >= pages)}
      </div>
    </nav>
  );
}
