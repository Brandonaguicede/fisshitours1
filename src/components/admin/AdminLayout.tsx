import { Bell, CalendarDays, CreditCard, FileText, Gauge, Globe2, Image, LayoutDashboard, LifeBuoy, LogOut, MapPin, Menu, MessageSquare, Package, Settings, Ship, Star, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { getCurrentAdminProfile, signOutAdmin, type AdminProfile } from '../../services/adminAuthService';
import ThemeToggle from '../../components/admin/ThemeToggle';
import '../../styles/admin.css';

const navGroups = [
  {
    caption: 'General',
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
      { label: 'Reservas', to: '/admin/reservations', icon: CalendarDays },
    ],
  },
  {
    caption: 'Catalogo',
    items: [
      { label: 'Tours', to: '/admin/tours', icon: Star },
      { label: 'Botes', to: '/admin/boats', icon: Ship },
      { label: 'Paquetes (todos)', to: '/admin/boat-tours', icon: Package },
    ],
  },
  {
    caption: 'Contenido',
    items: [
      { label: 'Textos editables', to: '/admin/content', icon: FileText },
      { label: 'Galeria', to: '/admin/gallery', icon: Image },
      { label: 'Destinos', to: '/admin/destinations', icon: MapPin },
      { label: 'Comentarios', to: '/admin/reviews', icon: MessageSquare },
    ],
  },
  {
    caption: 'Pagos y sistema',
    items: [
      { label: 'Metodos de pago', to: '/admin/payment-methods', icon: CreditCard },
      { label: 'Lugares de salida', to: '/admin/departure-locations', icon: MapPin },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

const titles: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/reservations': 'Reservas',
  '/admin/tours': 'Tours',
  '/admin/boats': 'Botes',
  '/admin/boat-tours': 'Paquetes (todos los tours)',
  '/admin/reviews': 'Comentarios',
  '/admin/gallery': 'Galeria',
  '/admin/destinations': 'Destinos',
  '/admin/content': 'Textos editables',
  '/admin/payment-methods': 'Metodos de pago',
  '/admin/departure-locations': 'Lugares de salida',
  '/admin/settings': 'Settings',
};

export default function AdminLayout() {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 961px)').matches);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches);
  const location = useLocation();
  const navigate = useNavigate();
  const title = titles[location.pathname] ?? 'Panel admin';
  const crumb = useMemo(() => `Fishing Tours / Admin / ${title}`, [title]);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const onChange = (event: MediaQueryListEvent) => {
      setMobile(event.matches);
      setOpen(!event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mobile || open) sidebarRef.current?.removeAttribute('inert');
    else sidebarRef.current?.setAttribute('inert', '');
  }, [mobile, open]);

  useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 960px)').matches) return;
    const sidebar = sidebarRef.current;
    const focusable = sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    focusable?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!accountOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [accountOpen]);

  function closeOnMobile() {
    if (window.matchMedia('(max-width: 960px)').matches) setOpen(false);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getCurrentAdminProfile()
      .then((nextProfile) => {
        if (!mounted) return;
        setProfile(nextProfile);
        setAuthError('');
      })
      .catch((error) => {
        if (!mounted) return;
        setProfile(null);
        setAuthError(error instanceof Error ? error.message : 'No se pudo validar el acceso administrativo.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSignOut() {
    await signOutAdmin();
    navigate('/admin/login', { replace: true });
  }

  const displayName = profile?.full_name ?? profile?.email ?? 'Cuenta admin';
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  if (loading) {
    return <main className="admin-login"><p className="admin-muted">Validando acceso...</p></main>;
  }

  if (!profile) {
    if (authError) {
      sessionStorage.setItem('admin_auth_error', authError);
    }
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return (
    <div className={open ? 'admin-shell admin-shell--sidebar-open' : 'admin-shell admin-shell--sidebar-closed'}>
      <div className={open ? 'admin-mobile-overlay admin-mobile-overlay--visible' : 'admin-mobile-overlay'} onClick={() => { setOpen(false); menuButtonRef.current?.focus(); }} />
      <aside ref={sidebarRef} id="admin-sidebar" className={open ? 'admin-sidebar admin-sidebar--open' : 'admin-sidebar'} aria-hidden={mobile && !open}>
        <div className="admin-sidebar__header">
          <Link className="admin-sidebar__brand" to="/admin" aria-label="Dashboard Papagayo" onClick={closeOnMobile}>
            <span className="admin-brand-logo admin-brand-logo--sidebar">
              <img src="/images/papagayo-logo.png" alt="" aria-hidden="true" />
            </span>
            <span className="admin-sidebar__brand-copy">
              <strong>Papagayo</strong>
              <span>Admin console</span>
            </span>
          </Link>
          <button className="admin-sidebar__toggle" type="button" aria-label={open ? 'Colapsar menu' : 'Expandir menu'} aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen((value) => !value)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <div className="admin-sidebar__scroll">
          {navGroups.map((group) => (
            <div key={group.caption}>
              <p className="admin-sidebar__caption">{group.caption}</p>
              <ul className="admin-sidebar__nav">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      end={item.to === '/admin'}
                      className={({ isActive }) => (isActive ? 'admin-sidebar__link admin-sidebar__link--active' : 'admin-sidebar__link')}
                      to={item.to}
                      aria-label={item.label}
                      title={item.label}
                      onClick={closeOnMobile}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-content">
          <header className="admin-topbar">
            <button ref={menuButtonRef} className="admin-topbar__menu" type="button" aria-label="Abrir menu" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(true)}>
              <Menu size={19} />
            </button>
            <div className="admin-topbar__titles">
              <h1 className="admin-topbar__title">{title}</h1>
              <div className="admin-topbar__crumb">{crumb}</div>
            </div>
            <Link className="admin-icon-btn" to="/" aria-label="Ver sitio publico" title="Ver sitio publico">
              <Globe2 size={18} />
            </Link>
            <ThemeToggle />
            <button className="admin-icon-btn" type="button" aria-label="Notificaciones">
              <Bell size={18} />
            </button>
            <div ref={accountRef} className="admin-account">
              <button ref={accountTriggerRef} className="admin-account__trigger" type="button" aria-label="Abrir menu de cuenta" aria-expanded={accountOpen} aria-controls="admin-account-menu" title="Cuenta" onClick={() => setAccountOpen((value) => !value)}>
                <span className="admin-account__avatar" aria-hidden="true">{initials}</span>
              </button>
              {accountOpen ? (
                <div id="admin-account-menu" className="admin-account__menu" role="menu">
                  <div className="admin-account__identity"><strong>{displayName}</strong><span>{profile.email}</span><small>{profile.role}</small></div>
                  <button className="admin-account__signout" type="button" role="menuitem" onClick={() => void handleSignOut()}><LogOut size={16} /> Cerrar sesion</button>
                </div>
              ) : null}
            </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export { Gauge, LifeBuoy, Users };
