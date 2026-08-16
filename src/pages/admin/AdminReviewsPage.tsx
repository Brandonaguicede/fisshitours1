import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

export default function AdminReviewsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Comentarios" description="Aprueba, rechaza o destaca testimonios antes de mostrarlos publicamente." />
      <AdminToolbar>
        <select className="admin-select"><option>Pendientes</option><option>Aprobados</option><option>Rechazados</option></select>
        <input className="admin-input" placeholder="Buscar comentario" />
      </AdminToolbar>
      <AdminTable headers={['Cliente', 'Pais', 'Comentario', 'Rating', 'Estado', 'Destacado', 'Acciones']}>
        {adminData.testimonials.map((review) => (
          <tr key={review.id}>
            <td>{review.name}</td>
            <td>{review.country}</td>
            <td>{review.quote}</td>
            <td>{review.rating}</td>
            <td><AdminBadge value="pending" /></td>
            <td><AdminBadge value /></td>
            <td><button className="admin-btn admin-btn--ghost">Revisar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
