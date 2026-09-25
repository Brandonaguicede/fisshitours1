import type { ReactNode } from 'react';

import {
  ANALYTICS_CRITERION_TEXT,
  EMPTY_TREND_MESSAGE,
  type DashboardAnalytics,
  type DashboardDemandItem,
  type DashboardMethodItem,
  type DashboardMostUsedMethod,
  type DashboardWeek,
} from '../../utils/dashboardMetrics';

// Dependency-free charts for the Dashboard analytics. Every mark is backed by text (label + number), the drawing itself
// is aria-hidden, and colour never carries meaning alone: the accessible content is a plain list / legend.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-09-21` -> `21 sep` (or `21 sep 2026`). Read from the string so the browser's time zone can never shift the day. */
export function formatIsoDay(iso: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const day = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]}`;
  return withYear ? `${day} ${match[1]}` : day;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const bookingsText = (count: number) => plural(count, 'reserva', 'reservas');

export type AnalyticsStatus = 'loading' | 'error' | 'ready';

function ChartCard({ id, title, note, status, isEmpty, children }: { id: string; title: string; note?: string; status: AnalyticsStatus; isEmpty: boolean; children: ReactNode }) {
  return (
    <article className="admin-dash-chart" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {note ? <p className="admin-dash-chart__note">{note}</p> : null}
      {status === 'loading' ? <p className="admin-dash-empty" role="status">Cargando…</p>
        : status === 'error' ? <p className="admin-dash-empty">No se pudo cargar esta gráfica.</p>
          : isEmpty ? <p className="admin-dash-empty">{EMPTY_TREND_MESSAGE}</p>
            : children}
    </article>
  );
}

function DemandBars({ items }: { items: DashboardDemandItem[] }) {
  const max = Math.max(...items.map((item) => item.count));
  return (
    <ul className="admin-dash-bars">
      {items.map((item) => (
        <li key={item.id} title={`${item.label}: ${bookingsText(item.count)}`}>
          <div className="admin-dash-bars__row">
            <span className="admin-dash-bars__label">{item.label}</span>
            <strong className="admin-dash-bars__value">{item.count}<span className="admin-visually-hidden"> {item.count === 1 ? 'reserva' : 'reservas'}</span></strong>
          </div>
          <span className="admin-dash-bars__track" aria-hidden="true"><span className="admin-dash-bars__fill" style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }} /></span>
        </li>
      ))}
    </ul>
  );
}

function WeeklyBars({ weeks }: { weeks: DashboardWeek[] }) {
  const max = Math.max(...weeks.map((week) => week.count));
  return (
    <ol className="admin-dash-weeks">
      {weeks.map((week, index) => {
        const isCurrent = index === weeks.length - 1;
        const range = `${formatIsoDay(week.start)} - ${formatIsoDay(week.end)}`;
        return (
          <li key={week.start} className={isCurrent ? 'admin-dash-weeks__item admin-dash-weeks__item--current' : 'admin-dash-weeks__item'} title={`Semana del ${range}${isCurrent ? ' (en curso)' : ''}: ${bookingsText(week.count)}`}>
            <span className="admin-dash-weeks__count" aria-hidden="true">{week.count}</span>
            <span className="admin-dash-weeks__track" aria-hidden="true"><span className="admin-dash-weeks__bar" style={{ height: week.count === 0 ? '2px' : `${Math.max((week.count / max) * 100, 4)}%` }} /></span>
            <span className="admin-dash-weeks__label" aria-hidden="true">{formatIsoDay(week.start)}</span>
            <span className="admin-visually-hidden">Semana del {range}{isCurrent ? ' (en curso)' : ''}: {bookingsText(week.count)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MostUsedMethod({ mostUsed }: { mostUsed: DashboardMostUsedMethod }) {
  const tied = mostUsed.labels.length > 1;
  return (
    <p className="admin-dash-highlight">
      <span>{tied ? 'Métodos más usados (empate)' : 'Método más usado'}</span>
      <strong>{mostUsed.labels.join(' y ')}</strong>
      <span>{bookingsText(mostUsed.count)}{tied ? ' cada uno' : ''} · {mostUsed.percent}%</span>
    </p>
  );
}

const DONUT_COLORS = 8;

function MethodDonut({ methods, total }: { methods: DashboardMethodItem[]; total: number }) {
  // r = 100 / (2π): the circle's circumference is exactly 100, so a dash length is the share in percent.
  const radius = 15.9155;
  let offset = 0;
  return (
    <div className="admin-dash-donut">
      <svg className="admin-dash-donut__svg" viewBox="0 0 42 42" aria-hidden="true" focusable="false">
        <circle className="admin-dash-donut__ring" cx="21" cy="21" r={radius} fill="none" />
        {methods.map((method, index) => {
          const share = (method.count / total) * 100;
          const segment = <circle key={method.id} className={`admin-dash-donut__seg admin-dash-color-${index % DONUT_COLORS}`} cx="21" cy="21" r={radius} fill="none" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={25 - offset} />;
          offset += share;
          return segment;
        })}
        <text className="admin-dash-donut__total" x="21" y="21.5" textAnchor="middle" dominantBaseline="middle">{total}</text>
      </svg>
      <ul className="admin-dash-legend">
        {methods.map((method, index) => (
          <li key={method.id} title={`${method.label}: ${bookingsText(method.count)} (${method.percent}%)`}>
            <span className={`admin-dash-legend__swatch admin-dash-color-${index % DONUT_COLORS}`} aria-hidden="true" />
            <span className="admin-dash-legend__label">{method.label}</span>
            <span className="admin-dash-legend__value"><strong>{method.count}</strong> · {method.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The four analytics with their visible period and counting rule. `analytics` is undefined while loading or after a
 * failed load: those states say so instead of drawing empty charts or zeros.
 */
export function DashboardAnalyticsPanel({ analytics, status }: { analytics?: DashboardAnalytics; status: AnalyticsStatus }) {
  const ready = status === 'ready' && analytics ? analytics : undefined;
  const empty = !ready || ready.total === 0;
  const period = ready ? `Últimas ${ready.period.weeks} semanas: ${formatIsoDay(ready.period.start)} - ${formatIsoDay(ready.period.end, true)}` : 'Últimas 12 semanas';
  return (
    <section className="admin-module-surface admin-dash-analytics" aria-labelledby="admin-dash-analytics-title">
      <div className="admin-module-surface__header">
        <div>
          <h2 id="admin-dash-analytics-title">Analítica de reservas</h2>
          <p><strong>{period}</strong> (semanas de lunes a domingo, según la fecha de creación). {ANALYTICS_CRITERION_TEXT}</p>
        </div>
      </div>
      <div className="admin-dash-analytics__grid">
        <ChartCard id="admin-dash-boat-title" title="Demanda por bote" status={status} isEmpty={empty}>
          {ready ? <DemandBars items={ready.demandByBoat} /> : null}
        </ChartCard>
        <ChartCard id="admin-dash-tour-title" title="Demanda por tour" status={status} isEmpty={empty}>
          {ready ? <DemandBars items={ready.demandByTour} /> : null}
        </ChartCard>
        <ChartCard id="admin-dash-weekly-title" title="Reservas por semana" note="Semana en curso incluida; puede estar incompleta." status={status} isEmpty={empty}>
          {ready ? <WeeklyBars weeks={ready.weeklyBookings} /> : null}
        </ChartCard>
        <ChartCard id="admin-dash-method-title" title="Método de pago" status={status} isEmpty={empty}>
          {ready ? (
            <>
              {ready.mostUsedPaymentMethod ? <MostUsedMethod mostUsed={ready.mostUsedPaymentMethod} /> : null}
              <MethodDonut methods={ready.paymentMethods} total={ready.total} />
            </>
          ) : null}
        </ChartCard>
      </div>
    </section>
  );
}
