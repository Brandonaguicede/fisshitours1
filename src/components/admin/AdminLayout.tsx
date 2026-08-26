import { Bell, CalendarDays, ChevronRight, CreditCard, FileText, Gauge, Image, LayoutDashboard, LifeBuoy, LogOut, MapPin, Menu, MessageSquare, Package, Settings, Ship, Star, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  '/admin/settings': 'Settings',
};

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const title = titles[location.pathname] ?? 'Panel admin';
  const crumb = useMemo(() => `Fishing Tours / Admin / ${title}`, [title]);

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
    <div className="admin-shell">
      <div className={open ? 'admin-mobile-overlay admin-mobile-overlay--visible' : 'admin-mobile-overlay'} onClick={() => setOpen(false)} />
      <aside className={open ? 'admin-sidebar admin-sidebar--open' : 'admin-sidebar'}>
        <Link className="admin-sidebar__brand" to="/admin" onClick={() => setOpen(false)}>
          <span className="admin-brand-logo admin-brand-logo--sidebar">
            <img src="/images/papagayo-logo.png" alt="" aria-hidden="true" />
          </span>
          <span>
            <strong>Papagayo</strong>
            <span>Admin console</span>
          </span>
        </Link>
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
                      onClick={() => setOpen(false)}
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
            <button className="admin-topbar__menu" type="button" aria-label={open ? 'Cerrar menu' : 'Abrir menu'} onClick={() => setOpen((value) => !value)}>
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="admin-topbar__titles">
              <h1 className="admin-topbar__title">{title}</h1>
              <div className="admin-topbar__crumb">{crumb}</div>
            </div>
            <Link className="admin-btn admin-btn--secondary" to="/">
              Ver sitio <ChevronRight size={16} />
            </Link>
            <ThemeToggle />
            <button className="admin-icon-btn" type="button" aria-label="Notificaciones">
              <Bell size={18} />
            </button>
            <span className="admin-user-pill"><span>{profile.role.slice(0, 1).toUpperCase()}</span> {profile.full_name ?? profile.email}</span>
            <button className="admin-icon-btn" type="button" aria-label="Salir" onClick={() => void handleSignOut()}>
              <LogOut size={18} />
            </button>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export { Gauge, LifeBuoy, Users };
