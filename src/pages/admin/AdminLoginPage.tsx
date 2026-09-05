import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { getCurrentAdminProfile, signInAdmin } from '../../services/adminAuthService';
import '../../styles/admin.css';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const storedError = sessionStorage.getItem('admin_auth_error');
    if (storedError) {
      setError(storedError);
      sessionStorage.removeItem('admin_auth_error');
    }

    const timeout = window.setTimeout(() => {
      if (mounted) setChecking(false);
    }, 3000);

    setChecking(true);
    getCurrentAdminProfile()
      .then((profile) => {
        if (mounted && profile) setAuthenticated(true);
      })
      .catch(() => {
        if (mounted && !storedError) setError('');
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signInAdmin(email.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin', { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo iniciar sesion.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authenticated) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <main className="admin-login">
      <div className="admin-login__stack">
        <span className="admin-login__brand">
          <img src="/images/papagayo-logo.png" alt="Papagayo Fishing Tours" />
        </span>
        <section className="admin-login__card">
          <h1>Panel de administración</h1>
          <p className="admin-muted">Inicia sesion con tu cuenta de staff.</p>
          {checking ? <p className="admin-muted">Validando sesion existente...</p> : null}
          <form className="admin-login__form" onSubmit={handleSubmit}>
          <label className="admin-login__field">
            <span className="admin-login__label">Email</span>
            <input
              className="admin-input"
              type="email"
              placeholder="admin@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="admin-login__field">
            <span className="admin-login__label">Password</span>
            <input
              className="admin-input"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
          <button className="admin-btn" type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {submitting ? 'Entrando...' : 'Entrar al panel'}
          </button>
          <Link className="admin-btn admin-btn--secondary" to="/">Volver al sitio</Link>
          </form>
        </section>
      </div>
    </main>
  );
}
