import { Edit2, MapPin, Plus, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminReorderToolbar, AdminTable } from '../../components/admin/AdminPrimitives';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import type { DepartureLocation } from '../../services/bookingService';
import { money } from '../../utils/format';

type FormState = Omit<DepartureLocation, 'id'> & { id?: string };
type StatusFilter = 'all' | 'active' | 'inactive';

const emptyForm: FormState = {
  name: '',
  slug: '',
  description: '',
  // Admin still only edits this single field; description_es/description_en
  // are filled by "Traducir todo el sitio" and never surfaced in this form.
  description_es: null,
  description_en: null,
  surcharge_amount: 0,
  currency: 'USD',
  active: true,
  sort_order: 0,
  is_default: false,
};

export default function AdminDepartureLocationsPage() {
  const db = supabase as any;
  const [locations, setLocations] = useState<DepartureLocation[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nameError, setNameError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [locations]);
  const visibleLocations = useMemo(
    () => sortedLocations
      .filter((location) => statusFilter === 'all' || (statusFilter === 'active') === location.active)
      .filter((location) => `${location.name} ${location.slug}`.toLowerCase().includes(search.toLowerCase())),
    [sortedLocations, search, statusFilter],
  );
  const activeFilterCount = Number(statusFilter !== 'all');
  const reorder = useAdminReorder(sortedLocations);
  const canReorder = search.trim() === '' && statusFilter === 'all';

  async function persistOrder(updates: Array<{ id: string; sort_order: number }>) {
    setError('');
    for (const update of updates) {
      const { error } = await db.from('departure_locations').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) { setError(error.message); throw new Error(error.message); }
    }
    setNotice('Orden actualizado.');
    await loadLocations();
  }

  async function loadLocations() {
    setLoading(true);
    setError('');
    const { data, error } = await db
      .from('departure_locations')
      .select('id, name, slug, description, description_es, description_en, surcharge_amount, currency, active, sort_order, is_default')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    setLoading(false);
    if (error) {
      setLocations([]);
      setError(error.message);
      return;
    }
    setLocations((data ?? []) as DepartureLocation[]);
  }

  useEffect(() => {
    void loadLocations();
  }, []);

  function editLocation(location: DepartureLocation) {
    setEditingId(location.id);
    setForm({ ...location, description: location.description ?? '' });
    setNotice('');
    setError('');
    setModalOpen(true);
  }

  function openCreate() {
    resetForm();
    setForm((value) => ({ ...value, sort_order: locations.length + 1 }));
    setModalOpen(true);
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
    setNameError('');
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function saveLocation() {
    if (!form.name.trim()) {
      setNameError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    // Generated once, on creation, from the name — never re-derived on later
    // edits, so it can't silently drift or collide once a URL/reference
    // depends on it.
    const slug = editingId ? form.slug : slugify(form.name);
    const payload = {
      name: form.name.trim(),
      slug,
      description: form.description?.trim() || null,
      surcharge_amount: Number(form.surcharge_amount),
      currency: form.currency || 'USD',
      active: form.active,
      sort_order: Number(form.sort_order),
      is_default: form.is_default,
    };
    const request = editingId
      ? db.from('departure_locations').update(payload).eq('id', editingId)
      : db.from('departure_locations').insert(payload);
    const { error } = await request;
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(editingId ? 'Lugar actualizado.' : 'Lugar creado.');
    setModalOpen(false);
    resetForm();
    await loadLocations();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Lugares de salida" description="Administra puntos de salida, cargos adicionales, orden y disponibilidad." />
      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar lugar por nombre"
          filters={
            <AdminFilterMenu panelLabel="Filtros de lugares de salida" panelDescription="Refina la lista de lugares." activeCount={activeFilterCount} onReset={() => setStatusFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Estado</span>
                <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </label>
            </AdminFilterMenu>
          }
          primaryAction={<button className="admin-btn" type="button" onClick={openCreate} disabled={reorder.reordering}><Plus size={16} /> Nuevo lugar</button>}
          secondaryActions={
            <AdminReorderToolbar
              reordering={reorder.reordering}
              saving={reorder.saving}
              onStart={() => reorder.start()}
              onCancel={reorder.cancel}
              onSave={() => void reorder.save(persistOrder)}
              disabledReason={canReorder ? undefined : 'Limpia la búsqueda y el filtro de estado para reordenar.'}
            />
          }
        />

        {error && !modalOpen ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}

        {loading ? (
          <p className="admin-muted">Cargando lugares...</p>
        ) : (
          <AdminTable embedded headers={['Lugar', 'Cargo', 'Orden', 'Estado', 'Predeterminado', 'Acciones']}>
            {(reorder.reordering ? reorder.order : visibleLocations).map((location, index) => (
              <tr
                key={location.id}
                className={reorder.reordering ? `admin-sortable-row${reorder.dragId === location.id ? ' admin-sortable-row--dragging' : ''}` : undefined}
                {...(reorder.reordering ? reorder.dragHandlers(location.id) : {})}
              >
                <td>
                  <div className="admin-cell-with-icon">
                    <MapPin size={16} className="admin-cell-with-icon__icon" />
                    <div>
                      <div>{location.name}</div>
                      <div className="admin-muted">{location.description || '-'}</div>
                    </div>
                  </div>
                </td>
                <td>{Number(location.surcharge_amount) > 0 ? money(Number(location.surcharge_amount)) : 'Sin costo'}</td>
                <td>
                  {reorder.reordering ? (
                    <AdminReorderHandle
                      position={index + 1}
                      total={reorder.order.length}
                      dragging={reorder.dragId === location.id}
                      onMoveUp={() => reorder.moveBy(location.id, -1)}
                      onMoveDown={() => reorder.moveBy(location.id, 1)}
                    />
                  ) : location.sort_order}
                </td>
                <td><AdminBadge value={location.active ? 'active' : 'inactive'} /></td>
                <td>{location.is_default ? 'Si' : '-'}</td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-icon-action" type="button" title="Editar lugar de salida" aria-label={`Editar lugar de salida ${location.name}`} disabled={reorder.reordering} onClick={() => editLocation(location)}><Edit2 size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleLocations.length === 0 ? <tr><td colSpan={6} className="admin-muted">No hay lugares para este filtro.</td></tr> : null}
          </AdminTable>
        )}
      </AdminModuleSurface>

      <Modal open={modalOpen} onClose={closeModal} titleId="departure-location-title" className="max-w-2xl">
        <div className="admin-modal-shell">
          <header className="admin-modal-header">
            <h2 id="departure-location-title" className="admin-card__title">{editingId ? <><Edit2 size={18} /> Editar lugar de salida</> : <><Plus size={18} /> Nuevo lugar de salida</>}</h2>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={closeModal}><X size={18} /></button>
          </header>
          <div className="admin-modal-body">
            {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
            <div className="admin-form-grid">
              <label className="admin-field">
                <span className="admin-field__label">Nombre</span>
                <input className="admin-input" aria-invalid={nameError ? true : undefined} value={form.name} onChange={(event) => { setForm((value) => ({ ...value, name: event.target.value })); if (nameError) setNameError(''); }} />
                {nameError ? <span className="admin-field-error">{nameError}</span> : null}
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Cargo adicional</span>
                <input className="admin-input" min={0} step="0.01" type="number" value={form.surcharge_amount} onChange={(event) => setForm((value) => ({ ...value, surcharge_amount: Number(event.target.value) }))} />
              </label>
              <label className="admin-field admin-field--wide">
                <span className="admin-field__label">Descripcion</span>
                <textarea className="admin-input" rows={3} value={form.description ?? ''} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} />
              </label>
              <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm((value) => ({ ...value, active: event.target.checked }))} /> Activo</label>
              <label className="admin-check"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm((value) => ({ ...value, is_default: event.target.checked }))} /> Seleccionado por defecto</label>
            </div>
            <p className="admin-field-help">Orden actual: {form.sort_order}. Se reordena desde la lista con el botón "Reordenar".</p>
          </div>
          <ModalFooter>
            <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveLocation()}><Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}</button>
            <button className="admin-btn admin-btn--secondary" type="button" onClick={closeModal}>Cancelar</button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
