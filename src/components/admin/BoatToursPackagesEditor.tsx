import { Check, Eye, EyeOff, Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  deletePackage,
  disableTourForBoat,
  enableTourForBoat,
  loadBoatToursPackages,
  packageSlug,
  savePackageForBoatTour,
  type AdminPackageRow,
  type AdminTourOption,
  type BoatToursPackagesData,
  type PackageInput,
} from '../../services/adminBoatToursService';
import FormSection from './FormSection';

interface Props {
  boatId: string;
  boatName: string;
  boatMaxGuests: number;
}

interface DraftPackage {
  id: string;
  tourId: string;
  name: string;
  packageType: string;
  durationHours: string;
  basePrice: string;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  description: string;
  customQuote: boolean;
  active: boolean;
  sortOrder: number;
  isNew: boolean;
}

type FieldErrors = Partial<Record<string, string>>;

function rowToDraft(row: AdminPackageRow, tourId: string): DraftPackage {
  return {
    id: row.id,
    tourId,
    name: row.name,
    packageType: row.package_type,
    durationHours: row.duration_minutes == null ? '' : String(row.duration_minutes / 60),
    basePrice: String(row.base_price),
    includedGuests: row.included_guests,
    maxGuests: row.max_guests,
    extraGuestPrice: Number(row.extra_guest_price),
    description: row.description ?? '',
    customQuote: row.custom_quote,
    active: row.active,
    sortOrder: row.sort_order,
    isNew: false,
  };
}

function newDraft(tourId: string, boatMaxGuests: number, sortOrder: number): DraftPackage {
  return {
    id: `package-${crypto.randomUUID().slice(0, 8)}`,
    tourId,
    name: '',
    packageType: '',
    durationHours: '',
    basePrice: '',
    includedGuests: 1,
    maxGuests: boatMaxGuests,
    extraGuestPrice: 0,
    description: '',
    customQuote: false,
    active: true,
    sortOrder,
    isNew: true,
  };
}

function validateDraft(draft: DraftPackage, boatMaxGuests: number): FieldErrors {
  const errors: FieldErrors = {};
  const key = `pkg-${draft.id}`;
  if (!draft.name.trim()) errors[`${key}-name`] = 'El nombre es obligatorio.';
  if (draft.durationHours.trim() && (!Number.isFinite(Number(draft.durationHours)) || Number(draft.durationHours) <= 0)) {
    errors[`${key}-duration`] = 'Si indicas horas, deben ser mayores que cero.';
  }
  if (!draft.basePrice.trim() || !Number.isFinite(Number(draft.basePrice)) || Number(draft.basePrice) < 0) {
    errors[`${key}-price`] = 'Ingresa un precio válido.';
  }
  if (!Number.isFinite(draft.includedGuests) || draft.includedGuests < 1) {
    errors[`${key}-included`] = 'Debe incluir al menos una persona.';
  }
  if (draft.includedGuests > boatMaxGuests) {
    errors[`${key}-included`] = `El bote admite máximo ${boatMaxGuests} personas.`;
  }
  if (!Number.isFinite(draft.extraGuestPrice) || draft.extraGuestPrice < 0) {
    errors[`${key}-extra`] = 'El extra no puede ser negativo.';
  }
  return errors;
}

interface PackageDraftEditorProps {
  draft: DraftPackage;
  fieldErrors: FieldErrors;
  busy: boolean;
  boatMaxGuests: number;
  onChange: (changes: Partial<DraftPackage>) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function PackageDraftEditor({ draft, fieldErrors, busy, boatMaxGuests, onChange, onCancel, onSave, onDelete }: PackageDraftEditorProps) {
  const key = `pkg-${draft.id}`;
  return (
    <div className="admin-package-compact-editor">
      <div className="admin-package-editor__heading">
        <h3>{draft.isNew ? 'Agregar paquete' : `Editar ${draft.name || 'paquete'}`}</h3>
        <div className="admin-package-editor__actions">
          <button
            className="admin-icon-btn"
            type="button"
            title={draft.active ? 'Desactivar' : 'Activar'}
            aria-label={draft.active ? 'Desactivar paquete' : 'Activar paquete'}
            onClick={() => onChange({ active: !draft.active })}
          >
            {draft.active ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          {!draft.isNew ? (
            <button
              className="admin-icon-btn admin-icon-btn--danger"
              type="button"
              title="Eliminar"
              aria-label="Eliminar paquete"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="admin-form-columns">
        <label className="admin-field">
          <span className="admin-field__label">Nombre</span>
          <input
            className="admin-input"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value, packageType: packageSlug(event.target.value) })}
          />
          {fieldErrors[`${key}-name`] ? <span className="admin-field-error">{fieldErrors[`${key}-name`]}</span> : null}
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Cantidad de horas (opcional)</span>
          <input
            className="admin-input"
            type="number"
            min={0.5}
            step={0.5}
            value={draft.durationHours}
            onChange={(event) => onChange({ durationHours: event.target.value })}
          />
          {fieldErrors[`${key}-duration`] ? <span className="admin-field-error">{fieldErrors[`${key}-duration`]}</span> : null}
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Precio base (USD)</span>
          <input
            className="admin-input admin-input--manual-number"
            type="number"
            min={0}
            step="any"
            value={draft.basePrice}
            onChange={(event) => onChange({ basePrice: event.target.value })}
          />
          {fieldErrors[`${key}-price`] ? <span className="admin-field-error">{fieldErrors[`${key}-price`]}</span> : null}
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Personas incluidas</span>
          <input
            className="admin-input"
            type="number"
            min={1}
            max={boatMaxGuests}
            value={draft.includedGuests}
            onChange={(event) => onChange({ includedGuests: Number(event.target.value) })}
          />
          {fieldErrors[`${key}-included`] ? <span className="admin-field-error">{fieldErrors[`${key}-included`]}</span> : null}
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Máximo del paquete</span>
          <input
            className="admin-input"
            type="number"
            min={1}
            max={boatMaxGuests}
            value={draft.maxGuests}
            onChange={(event) => onChange({ maxGuests: Number(event.target.value) })}
          />
          <span className="admin-field-help">Se limita al techo físico del bote ({boatMaxGuests}).</span>
        </label>
        <label className="admin-field">
          <span className="admin-field__label">Extra por persona adicional (USD)</span>
          <input
            className="admin-input"
            type="number"
            min={0}
            value={draft.extraGuestPrice}
            onChange={(event) => onChange({ extraGuestPrice: Number(event.target.value) })}
          />
          {fieldErrors[`${key}-extra`] ? <span className="admin-field-error">{fieldErrors[`${key}-extra`]}</span> : null}
        </label>
      </div>
      <label className="admin-field">
        <span className="admin-field__label">Descripción</span>
        <textarea
          className="admin-input admin-textarea-list"
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>
      <label className="admin-field admin-field--narrow">
        <span className="admin-field__label">
          <input
            type="checkbox"
            checked={draft.customQuote}
            onChange={(event) => onChange({ customQuote: event.target.checked })}
          />{' '}
          Cotización personalizada (sin precio automático)
        </span>
      </label>
      <div className="admin-actions">
        <button className="admin-btn admin-btn--secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="admin-btn" type="button" disabled={busy} onClick={onSave}>
          {busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Guardar paquete
        </button>
      </div>
    </div>
  );
}

export default function BoatToursPackagesEditor({ boatId, boatName, boatMaxGuests }: Props) {
  const [data, setData] = useState<BoatToursPackagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPackage | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadBoatToursPackages(boatId));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar el catálogo de tours.');
    } finally {
      setLoading(false);
    }
  }, [boatId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const linkByTour = useMemo(() => {
    const map = new Map<string, BoatToursPackagesData['links'][number]>();
    for (const link of data?.links ?? []) map.set(link.tour_id, link);
    return map;
  }, [data]);

  const packagesByTour = useMemo(() => {
    const map = new Map<string, AdminPackageRow[]>();
    const linkTour = new Map((data?.links ?? []).map((link) => [link.id, link.tour_id]));
    for (const row of data?.packages ?? []) {
      const tourId = linkTour.get(row.boat_tour_id);
      if (!tourId) continue;
      const list = map.get(tourId) ?? [];
      list.push(row);
      map.set(tourId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [data]);

  const assignedTours = useMemo(
    () => (data?.tours ?? []).filter((tour) => linkByTour.has(tour.id)),
    [data, linkByTour],
  );
  const availableTours = useMemo(
    () => (data?.tours ?? []).filter((tour) => !linkByTour.has(tour.id)),
    [data, linkByTour],
  );

  async function run(action: () => Promise<void>, okMessage?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (okMessage) setNotice(okMessage);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La operación no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setFieldErrors({});
  }

  function startEditing(row: AdminPackageRow, tourId: string) {
    setDraft(rowToDraft(row, tourId));
    setEditingId(row.id);
    setFieldErrors({});
  }

  function startCreating(tour: AdminTourOption) {
    const count = packagesByTour.get(tour.id)?.length ?? 0;
    const next = newDraft(tour.id, boatMaxGuests, count + 1);
    setDraft(next);
    setEditingId(next.id);
    setFieldErrors({});
  }

  function updateDraft(changes: Partial<DraftPackage>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  async function persistDraft() {
    if (!draft) return;
    const errors = validateDraft(draft, boatMaxGuests);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const input: PackageInput = {
      id: draft.id,
      name: draft.name,
      packageType: draft.packageType || packageSlug(draft.name),
      durationMinutes: draft.durationHours.trim() ? Math.round(Number(draft.durationHours) * 60) : null,
      basePrice: Number(draft.basePrice),
      includedGuests: draft.includedGuests,
      maxGuests: draft.maxGuests,
      extraGuestPrice: draft.extraGuestPrice,
      description: draft.description.trim() || null,
      customQuote: draft.customQuote,
      active: draft.active,
      sortOrder: draft.sortOrder,
    };
    await run(async () => {
      await savePackageForBoatTour(boatId, draft.tourId, input, boatMaxGuests);
      closeEditor();
    }, 'Paquete guardado.');
  }

  async function removeDraft() {
    if (!draft) return;
    await run(async () => {
      await deletePackage(draft.id);
      closeEditor();
    }, 'Paquete eliminado.');
  }

  if (loading) return <p className="admin-muted">Cargando tours y paquetes...</p>;

  return (
    <div className="admin-boat-tours-editor">
      {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      <FormSection
        title="Tours disponibles"
        description={`Marca los tours que ${boatName || 'este bote'} ofrece. La relación interna se crea sola.`}
        icon={<Check size={16} />}
      >
        <div className="admin-dynamic-list">
          {(data?.tours ?? []).map((tour) => {
            const enabled = linkByTour.has(tour.id);
            const activeCount = (packagesByTour.get(tour.id) ?? []).filter((row) => row.active).length;
            return (
              <label className="admin-dynamic-list__row" key={tour.id} style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.checked) {
                      void run(() => enableTourForBoat(boatId, tour.id, tour.sort_order), `${tour.title} habilitado.`);
                    } else {
                      void run(() => disableTourForBoat(boatId, tour.id), `${tour.title} deshabilitado (los paquetes se conservan inactivos).`);
                    }
                  }}
                />
                <span className="admin-input" style={{ border: 'none', background: 'transparent' }}>
                  {tour.title}
                  {enabled ? <span className="admin-muted"> · {activeCount} paquete(s) activo(s)</span> : null}
                </span>
              </label>
            );
          })}
          {(data?.tours ?? []).length === 0 ? <p className="admin-muted">No hay tours en el catálogo. Créalos primero en la sección Tours.</p> : null}
        </div>
      </FormSection>

      {assignedTours.map((tour) => (
        <FormSection
          key={tour.id}
          title={`${tour.title} · paquetes`}
          description={`Precios y condiciones de ${tour.title} en ${boatName || 'este bote'}.`}
          icon={<Package size={16} />}
        >
          <div className="admin-package-previews">
            {(packagesByTour.get(tour.id) ?? []).map((row) => (
              <div key={row.id}>
                <article className="admin-package-preview">
                  <strong>
                    {row.name || 'Paquete sin nombre'}
                    {!row.active ? <span className="admin-muted"> · inactivo</span> : null}
                  </strong>
                  <button
                    className="admin-icon-action"
                    type="button"
                    title="Editar paquete"
                    aria-label={`Editar ${row.name || 'paquete'}`}
                    onClick={() => (editingId === row.id ? closeEditor() : startEditing(row, tour.id))}
                  >
                    <Pencil size={17} />
                  </button>
                </article>
                {editingId === row.id && draft ? (
                  <PackageDraftEditor
                    draft={draft}
                    fieldErrors={fieldErrors}
                    busy={busy}
                    boatMaxGuests={boatMaxGuests}
                    onChange={updateDraft}
                    onCancel={closeEditor}
                    onSave={() => void persistDraft()}
                    onDelete={() => void removeDraft()}
                  />
                ) : null}
              </div>
            ))}
            {editingId && draft?.isNew && draft.tourId === tour.id ? (
              <PackageDraftEditor
                draft={draft}
                fieldErrors={fieldErrors}
                busy={busy}
                boatMaxGuests={boatMaxGuests}
                onChange={updateDraft}
                onCancel={closeEditor}
                onSave={() => void persistDraft()}
                onDelete={() => void removeDraft()}
              />
            ) : null}
          </div>
          <button className="admin-btn admin-btn--secondary" type="button" disabled={busy} onClick={() => startCreating(tour)}>
            <Plus size={15} /> Agregar paquete
          </button>
        </FormSection>
      ))}

      {availableTours.length && assignedTours.length ? (
        <p className="admin-muted">Tours sin habilitar para este bote: {availableTours.map((tour) => tour.title).join(', ')}.</p>
      ) : null}
    </div>
  );
}
