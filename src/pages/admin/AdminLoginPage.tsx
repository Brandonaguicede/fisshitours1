import { Anchor } from 'lucide-react';
import { Link } from 'react-router-dom';

import '../../styles/admin.css';

export default function AdminLoginPage() {
  return (
    <main className="admin-login">
      <section className="admin-login__card">
        <span className="admin-sidebar__mark"><Anchor size={18} /></span>
        <h1 className="mt-4">Admin Fishing Tours</h1>
        <p className="admin-muted mt-2">Login visual preparado para Supabase Auth.</p>
        <form className="admin-login__form">
          <input className="admin-input" type="email" placeholder="admin@example.com" />
          <input className="admin-input" type="password" placeholder="Password" />
          <Link className="admin-btn" to="/admin">Entrar al panel</Link>
          <Link className="admin-btn admin-btn--secondary" to="/">Volver al sitio</Link>
        </form>
      </section>
    </main>
  );
}
