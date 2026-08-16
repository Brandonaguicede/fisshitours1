import { Bell, CalendarDays, ChevronRight, CreditCard, FileText, Gauge, Image, LayoutDashboard, LifeBuoy, LogOut, MapPin, Menu, MessageSquare, Package, Settings, Ship, Star, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

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
      { label: 'Paquetes', to: '/admin/boat-tours', icon: Package },
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
  '/admin/boat-tours': 'Paquetes por bote',
  '/admin/reviews': 'Comentarios',
  '/admin/gallery': 'Galeria',
  '/admin/destinations': 'Destinos',
  '/admin/content': 'Textos editables',
  '/admin/payment-methods': 'Metodos de pago',
  '/admin/settings': 'Settings',
};

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const title = titles[location.pathname] ?? 'Panel admin';
  const crumb = useMemo(() => `Fishing Tours / Admin / ${title}`, [title]);

  return (
    <div className="admin-shell">
      <div className={open ? 'admin-mobile-overlay admin-mobile-overlay--visible' : 'admin-mobile-overlay'} onClick={() => setOpen(false)} />
      <aside className={open ? 'admin-sidebar admin-sidebar--open' : 'admin-sidebar'}>
        <Link className="admin-sidebar__brand" to="/admin" onClick={() => setOpen(false)}>
          <span className="admin-sidebar__mark">PFT</span>
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
            <button className="admin-icon-btn" type="button" aria-label="Notificaciones">
              <Bell size={18} />
            </button>
            <span className="admin-user-pill"><span>A</span> Admin</span>
            <Link className="admin-icon-btn" to="/admin/login" aria-label="Salir">
              <LogOut size={18} />
            </Link>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export { Gauge, LifeBuoy, Users };
