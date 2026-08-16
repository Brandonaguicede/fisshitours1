import { Upload } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

export default function AdminGalleryPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Galeria" description="Imagenes publicas. Las nuevas subidas deben ir a Cloudflare Images." actions={<button className="admin-btn"><Upload size={16} /> Subir a Cloudflare</button>} />
      <AdminToolbar>
        <select className="admin-select"><option>Todas las categorias</option><option>fishing</option><option>boats</option><option>wildlife</option></select>
        <input className="admin-input" placeholder="Buscar por alt o titulo" />
      </AdminToolbar>
      <section className="admin-media-grid">
        {adminData.galleryImages.map((image) => (
          <article className="admin-media-card" key={image.id}>
            <img src={image.src} alt={image.alt} />
            <div className="admin-media-card__body">
              <strong>{image.category}</strong>
              <span className="admin-muted">{image.alt}</span>
              <div className="admin-actions"><AdminBadge value /><button className="admin-btn admin-btn--ghost">Editar</button></div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
