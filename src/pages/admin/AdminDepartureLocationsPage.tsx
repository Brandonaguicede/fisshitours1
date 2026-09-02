import { Edit2, MapPin, Plus, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminBadge, AdminModuleSurface, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import type { DepartureLocation } from '../../services/bookingService';
import { money } from './adminMockData';

type FormState = Omit<DepartureLocation, 'id'> & { id?: string };

const emptyForm: FormState = {
  name: '',
  slug: '',
  description: '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [locations]);

  async function loadLocations() {
    setLoading(true);
    setError('');
    const { data, error } = await db
      .from('departure_locations')
      .select('id, name, slug, description, surcharge_amount, currency, active, sort_order, is_default')
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
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  async function saveLocation() {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      name: form.name.trim(),
      slug: (form.slug || slugify(form.name)).trim(),
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
    resetForm();
    await loadLocations();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Lugares de salida" description="Administra puntos de salida, cargos adicionales, orden y disponibilidad." />
      <AdminModuleSurface>
        <AdminToolbar embedded>
          <button className="admin-btn" type="button" onClick={resetForm}><Plus size={16} /> Nuevo lugar</button>
        </AdminToolbar>

        {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}

        <div className="admin-form-grid">
          <label className="admin-field">
            <span className="admin-field__label">Nombre</span>
            <input className="admin-input" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value, slug: value.slug || slugify(event.target.value) }))} />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Slug</span>
            <input className="admin-input" value={form.slug} onChange={(event) => setForm((value) => ({ ...value, slug: event.target.value }))} />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Cargo adicional</span>
            <input className="admin-input" min={0} step="0.01" type="number" value={form.surcharge_amount} onChange={(event) => setForm((value) => ({ ...value, surcharge_amount: Number(event.target.value) }))} />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Orden</span>
            <input className="admin-input" type="number" value={form.sort_order} onChange={(event) => setForm((value) => ({ ...value, sort_order: Number(event.target.value) }))} />
          </label>
          <label className="admin-field admin-field--wide">
            <span className="admin-field__label">Descripcion</span>
            <textarea className="admin-input" rows={3} value={form.description ?? ''} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} />
          </label>
          <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm((value) => ({ ...value, active: event.target.checked }))} /> Activo</label>
          <label className="admin-check"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm((value) => ({ ...value, is_default: event.target.checked }))} /> Seleccionado por defecto</label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveLocation()}><Save size={16} /> Guardar</button>
          {editingId ? <button className="admin-btn admin-btn--secondary" type="button" onClick={resetForm}><X size={16} /> Cancelar</button> : null}
        </div>

        {loading ? (
          <p className="admin-muted">Cargando lugares...</p>
        ) : (
          <AdminTable embedded headers={['Lugar', 'Slug', 'Cargo', 'Orden', 'Estado', 'Default', 'Acciones']}>
            {sortedLocations.map((location) => (
              <tr key={location.id}>
                <td><MapPin size={14} /> {location.name}<div className="admin-muted">{location.description || '-'}</div></td>
                <td>{location.slug}</td>
                <td>{Number(location.surcharge_amount) > 0 ? money(Number(location.surcharge_amount)) : 'Sin costo'}</td>
                <td>{location.sort_order}</td>
                <td><AdminBadge value={location.active ? 'active' : 'inactive'} /></td>
                <td>{location.is_default ? 'Si' : '-'}</td>
                <td><button className="admin-btn admin-btn--secondary" type="button" onClick={() => editLocation(location)}><Edit2 size={14} /> Editar</button></td>
              </tr>
            ))}
            {sortedLocations.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay lugares configurados.</td></tr> : null}
          </AdminTable>
        )}
      </AdminModuleSurface>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
