import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function AdminPageHeader(props: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.actions ? <div className="admin-actions">{props.actions}</div> : null}
    </header>
  );
}

export function AdminStatCard(props: { label: string; value: string; icon: LucideIcon; color?: string }) {
  return (
    <article className="admin-stat-card" style={{ '--stat-color': props.color ?? '#0e7490' } as React.CSSProperties}>
      <div className="admin-stat-card__head">
        <p className="admin-stat-card__label">{props.label}</p>
        <span className="admin-stat-card__icon"><props.icon size={18} /></span>
      </div>
      <strong className="admin-stat-card__value">{props.value}</strong>
    </article>
  );
}

export function AdminBadge({ value }: { value: string | boolean }) {
  const text = typeof value === 'boolean' ? (value ? 'Activo' : 'Inactivo') : value.split('_').join(' ');
  const normalized = String(value).toLowerCase();
  const tone =
    normalized.includes('paid') || normalized.includes('confirmed') || normalized === 'true' || normalized.includes('approved')
        ? 'success'
        : normalized.includes('pending') || normalized.includes('requested') || normalized.includes('day')
          ? 'warning'
          : normalized.includes('cancel') || normalized.includes('failed') || normalized.includes('rejected') || normalized === 'false'
            ? 'danger'
            : 'neutral';
  return <span className={`admin-badge admin-badge--${tone}`}>{text}</span>;
}

export function AdminTable(props: { headers: string[]; children: ReactNode }) {
  return (
    <section className="admin-table-card">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>{props.headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>{props.children}</tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminToolbar(props: { children: ReactNode }) {
  return <div className="admin-toolbar">{props.children}</div>;
}
