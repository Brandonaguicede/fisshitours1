import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { getCurrentAdminProfile, signInAdmin } from '../../services/adminAuthService';
import { TURNSTILE_SITE_KEY, USE_LOCAL_TURNSTILE_MOCK, MOCK_TURNSTILE_TOKEN } from '../../lib/turnstile';
import '../../styles/admin.css';

// The global `Window.turnstile` type is already declared in TurnstileBox.tsx
// and merges across the project — no need to redeclare it here.

// Renders a light-themed Turnstile widget (the shared TurnstileBox component
// is styled for the public site's dark glass surfaces, which clashes with
// this page's plain white card). Inert until Supabase's own captcha
// enforcement is turned on for the project (see supabase/config.toml) — the
// token is still sent with every attempt so login is protected the moment
// that's flipped on, with no further code changes.
function AdminTurnstile({ onTokenChange }: { onTokenChange: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>();

  useEffect(() => {
    if (USE_LOCAL_TURNSTILE_MOCK) {
      onTokenChange(MOCK_TURNSTILE_TOKEN);
      return;
    }
    if (!TURNSTILE_SITE_KEY) return;
    const siteKey = TURNSTILE_SITE_KEY;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: 'admin-login',
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => onTokenChange(''),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      existing.addEventListener('load', renderWidget, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, [onTokenChange]);

  if (USE_LOCAL_TURNSTILE_MOCK || !TURNSTILE_SITE_KEY) return null;
  return <div className="mt-1" ref={containerRef} />;
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      await signInAdmin(email.trim(), password, captchaToken || undefined);
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
      <div className="admin-login__photo" aria-hidden="true" />
      <div className="admin-login__scrim" aria-hidden="true" />

      <div className="admin-login__mark" aria-hidden="true">
        <span className="admin-login__mark-title">Papagayo</span>
        <span className="admin-login__mark-sub">Costa Rica</span>
        <span className="admin-login__mark-rule" />
      </div>
      <p className="admin-login__signature" aria-hidden="true">Good Fishing<br />Brighter Days</p>
      <span className="admin-login__corner" aria-hidden="true">Costa Rica</span>

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
            <span className="admin-login__input-wrap">
              <Mail className="admin-login__input-icon" size={16} aria-hidden="true" />
              <input
                className="admin-input"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="admin-login__field">
            <span className="admin-login__label">Password</span>
            <span className="admin-login__input-wrap">
              <Lock className="admin-login__input-icon" size={16} aria-hidden="true" />
              <input
                className="admin-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="admin-login__input-toggle"
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          <AdminTurnstile onTokenChange={setCaptchaToken} />
          {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
          <button className="admin-btn" type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {submitting ? 'Entrando...' : 'Entrar al panel'}
            {submitting ? null : <ArrowRight size={16} />}
          </button>
          <Link className="admin-btn admin-btn--secondary" to="/">Volver al sitio</Link>
          </form>
          <p className="admin-login__divider"><span>Experiencias extraordinarias en el mar</span></p>
        </section>
      </div>
    </main>
  );
}
