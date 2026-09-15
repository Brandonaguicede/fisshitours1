export interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function AdminPagination({ page, pageSize, total, noun, loading, onPageChange, onPageSizeChange }: AdminPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + 1);
  const end = Math.min(page * pageSize, total);
  return (
    <nav className="admin-pagination" aria-label={`Paginación de ${noun}`} aria-busy={loading}>
      <p aria-live="polite">{`Mostrando ${start}–${end} de ${total} ${noun}`}</p>
      <label className="admin-pagination__size">
        Registros por página
        <select className="admin-select" value={pageSize} disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="admin-pagination__controls">
        <button type="button" className="admin-btn admin-btn--secondary" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
        <span aria-live="polite">Página {page} de {pages}</span>
        <button type="button" className="admin-btn admin-btn--secondary" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>Siguiente</button>
      </div>
    </nav>
  );
}
