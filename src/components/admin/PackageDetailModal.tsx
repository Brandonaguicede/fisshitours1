import { Pencil, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Modal } from '../common/Modal';
import { cleanList, editableList, editableText } from '../../utils/bilingualContent';
import { formatTime, money } from '../../utils/format';
import { parseMealOptions } from '../../utils/packageSettings';
import { AdminBadge } from './AdminPrimitives';
import ModalFooter from './ModalFooter';

export interface PackageDetail {
  id: string;
  name: string;
  name_en?: string | null;
  name_es?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_es?: string | null;
  duration_minutes?: number | null;
  base_price: number;
  included_guests: number;
  max_guests: number;
  extra_guest_price?: number | null;
  custom_quote: boolean;
  active: boolean;
  sort_order: number;
  departure_times?: string[] | null;
  meal_options?: unknown;
  package_included?: string[] | null;
  package_included_en?: string[] | null;
  package_included_es?: string[] | null;
  boat_tours?: {
    boat_id: string;
    tour_id: string;
    boats?: { name: string } | null;
    tours?: { title: string; title_en?: string | null; included?: unknown; included_en?: unknown } | null;
  } | null;
}

export function packageDisplayName(item: Pick<PackageDetail, 'name' | 'name_en'>) {
  return editableText(item as unknown as Record<string, unknown>, { legacy: 'name', en: 'name_en', es: 'name_es' }) || 'Paquete sin nombre';
}

export function formatDuration(minutes?: number | null) {
  if (!minutes || minutes <= 0) return 'A convenir';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Deep link to where packages are really edited: Botes > Editar bote > Tours y paquetes, focusing this package. */
export function packageEditPath(item: PackageDetail) {
  const params = new URLSearchParams();
  if (item.boat_tours?.boat_id) params.set('boatId', item.boat_tours.boat_id);
  if (item.boat_tours?.tour_id) params.set('tourId', item.boat_tours.tour_id);
  params.set('packageId', item.id);
  return `/admin/boats?${params.toString()}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-package-detail__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

interface Props {
  item: PackageDetail | null;
  onClose: () => void;
  onEdit: (item: PackageDetail) => void;
}

// Read-only summary card of a package. Nothing is editable here on purpose: packages are created and edited in
// Botes > Editar bote > Tours y paquetes, and the only action is a link to that exact place (the X closes).
export default function PackageDetailModal({ item, onClose, onEdit }: Props) {
  const own = item?.package_included ?? null;
  // A package that inherits the tour's list simply shows that list: the admin does not need to know where it comes from.
  const included = item
    ? cleanList(
      own !== null
        ? editableList(item as unknown as Record<string, unknown>, { legacy: 'package_included', en: 'package_included_en', es: 'package_included_es' })
        : item.boat_tours?.tours
          ? editableList(item.boat_tours.tours as unknown as Record<string, unknown>, { legacy: 'included', en: 'included_en', es: 'included_es' })
          : [],
    )
    : [];
  const meals = item ? parseMealOptions(item.meal_options).map((meal) => meal.en || meal.es).filter(Boolean) : [];
  const times = item?.departure_times ? [...item.departure_times].sort() : null;
  const description = item ? editableText(item as unknown as Record<string, unknown>, { legacy: 'description', en: 'description_en', es: 'description_es' }) : '';
  const extra = Number(item?.extra_guest_price ?? 0);

  return (
    <Modal open={Boolean(item)} onClose={onClose} titleId="package-detail-title" className="admin-package-detail-modal">
      {item ? (
        <div className="admin-modal-shell">
          <header className="admin-modal-header">
            <div className="admin-package-detail__title">
              <p className="admin-package-detail__eyebrow">{item.boat_tours?.tours?.title ?? 'Paquete'} · {item.boat_tours?.boats?.name ?? 'Bote'}</p>
              <h2 id="package-detail-title" className="admin-card__title">{packageDisplayName(item)}</h2>
              <div className="admin-package-detail__tags">
                <AdminBadge value={item.active} />
                <span className="admin-package-detail__tag">Solo lectura</span>
              </div>
            </div>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
          </header>

          <div className="admin-modal-body admin-package-detail" role="document">
            <div className="admin-package-detail__card">
              <dl className="admin-package-detail__grid admin-package-detail__grid--pair">
                <Field label="Bote">{item.boat_tours?.boats?.name ?? '-'}</Field>
                <Field label="Tour">{item.boat_tours?.tours?.title ?? '-'}</Field>
              </dl>
              <dl className="admin-package-detail__grid admin-package-detail__grid--metrics">
                <Field label="Precio base">{item.custom_quote ? 'Cotización personalizada' : money(Number(item.base_price))}</Field>
                <Field label="Personas incluidas">{item.included_guests}</Field>
                <Field label="Máximo">{item.max_guests}</Field>
                <Field label="Extra por persona">{extra > 0 ? money(extra) : 'Sin cargo'}</Field>
                <Field label="Duración">{formatDuration(item.duration_minutes)}</Field>
              </dl>
            </div>

            <section className="admin-package-detail__group" aria-label="Horarios">
              <h3>Horarios</h3>
              {times === null ? (
                <p className="admin-package-detail__text">Horarios generales</p>
              ) : times.length === 0 ? (
                <p className="admin-package-detail__text">Sin horarios</p>
              ) : (
                <ul className="admin-package-detail__chips" aria-label="Horarios de salida">{times.map((time) => <li key={time}>{formatTime(time)}</li>)}</ul>
              )}
            </section>

            {included.length > 0 || meals.length > 0 ? (
              <div className="admin-package-detail__columns">
                {included.length > 0 ? (
                  <section className="admin-package-detail__group" aria-label="Incluye">
                    <h3>Incluye</h3>
                    <ul className="admin-package-detail__list">{included.map((entry) => <li key={entry}>{entry}</li>)}</ul>
                  </section>
                ) : null}
                {meals.length > 0 ? (
                  <section className="admin-package-detail__group" aria-label="Comidas">
                    <h3>Comidas</h3>
                    <ul className="admin-package-detail__list">{meals.map((meal, index) => <li key={`${meal}-${index}`}>{meal}</li>)}</ul>
                  </section>
                ) : null}
              </div>
            ) : null}

            {description ? (
              <section className="admin-package-detail__group" aria-label="Descripción">
                <h3>Descripción</h3>
                <p className="admin-package-detail__text">{description}</p>
              </section>
            ) : null}
          </div>

          <ModalFooter className="admin-package-detail__footer">
            <button className="admin-btn" type="button" disabled={!item.boat_tours?.boat_id} onClick={() => onEdit(item)}>
              <Pencil size={15} /> Editar en Botes
            </button>
          </ModalFooter>
        </div>
      ) : null}
    </Modal>
  );
}
