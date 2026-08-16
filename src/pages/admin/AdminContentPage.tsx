import { Save } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

const sections = ['Home', 'Tours', 'Booking', 'Contact', 'Footer'];

export default function AdminContentPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Textos editables" description="Edita campos de texto, precio, imagen, URL y terminos sin tocar componentes." actions={<button className="admin-btn"><Save size={16} /> Guardar cambios</button>} />
      <div className="admin-grid-2">
        <aside className="admin-card">
          <h2>Estructura del sitio</h2>
          <p>Inspirado en el editor web del panel de referencia.</p>
          <ul className="admin-list mt-4">
            {sections.map((section) => <li key={section}><span>{section}</span><AdminBadge value={section === 'Home' ? 'active' : 'neutral'} /></li>)}
          </ul>
        </aside>
        <section className="admin-card">
          <h2>Campos editables</h2>
          <p>Estos keys luego viven en `editable_content` de Supabase.</p>
          <div className="mt-4">
            <AdminToolbar>
              <select className="admin-select"><option>Locale EN</option><option>Locale ES</option></select>
              <input className="admin-input" placeholder="Buscar key" />
            </AdminToolbar>
          </div>
        </section>
      </div>
      <AdminTable headers={['Key', 'Grupo', 'Locale', 'Tipo', 'Valor', 'Estado', 'Acciones']}>
        {adminData.content.map((item) => (
          <tr key={`${item.key}-${item.locale}`}>
            <td>{item.key}</td>
            <td>{item.group}</td>
            <td>{item.locale}</td>
            <td>{item.type}</td>
            <td>{item.value}</td>
            <td><AdminBadge value={item.active} /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
