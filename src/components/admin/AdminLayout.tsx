import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, FileText, Gauge, Globe2, Image, LayoutDashboard, LifeBuoy, LogOut, MapPin, Menu, MessageSquare, Package, Info, Ship, Star, Users } from 'lucide-react';
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
      { label: 'Resumen de paquetes', to: '/admin/boat-tours', icon: Package },
      { label: 'Lugares de salida', to: '/admin/departure-locations', icon: MapPin },
      { label: 'Metodos de pago', to: '/admin/payment-methods', icon: CreditCard },
    ],
  },
  {
    caption: 'Contenido',
    items: [
      { label: 'Portada', to: '/admin/portada', icon: FileText },
      { label: 'Sobre Nosotros', to: '/admin/sobre-nosotros', icon: Info },
      { label: 'Galeria', to: '/admin/gallery', icon: Image },
      { label: 'Comentarios', to: '/admin/reviews', icon: MessageSquare },
    ],
  },
];

const titles: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/reservations': 'Reservas',
  '/admin/tours': 'Tours',
  '/admin/boats': 'Botes',
  '/admin/boat-tours': 'Resumen de paquetes',
  '/admin/reviews': 'Comentarios',
  '/admin/gallery': 'Galeria',
  '/admin/portada': 'Portada',
  '/admin/sobre-nosotros': 'Sobre Nosotros',
  '/admin/payment-methods': 'Metodos de pago',
  '/admin/departure-locations': 'Lugares de salida',
};

export default function AdminLayout() {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 961px)').matches);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches);
  // True for one paint right after the desktop/mobile breakpoint itself is
  // crossed (matchMedia 'change'), so the sidebar's width/transform CSS
  // transition doesn't animate across that jump. Reproduced live: resizing
  // the window through 960px flips `.admin-sidebar` from `position: static`
  // (in flow) to `position: fixed` (off-canvas) in the same tick that
  // `.admin-main` re-expands to full width — but the sidebar's own
  // translateX kept easing over its normal 0.22s, so for that window it sat
  // as a fixed overlay sliding across the now-full-width main content
  // underneath it. A manual open/close click while already mobile is a
  // different interaction and should still animate, so this only guards the
  // breakpoint-crossing case, not the general transition.
  const [suppressSidebarTransition, setSuppressSidebarTransition] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const title = titles[location.pathname] ?? 'Panel admin';
  const crumb = useMemo(() => `Fishing Tours / Admin / ${title}`, [title]);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  // The sidebar's own scrollbar chrome is hidden (see .admin-sidebar__scroll
  // in admin.css), so when the nav list doesn't fit, there's otherwise no
  // hint that more items exist below the fold. This tracks real scroll
  // position (not just "is it scrollable") so the fade only shows while
  // there's actually more to see, and disappears exactly at the bottom.
  const [sidebarHasMoreBelow, setSidebarHasMoreBelow] = useState(false);

  useEffect(() => {
    // `sidebarScrollRef` is only attached once the real shell renders (not
    // during the "Validando acceso..." loading screen, which returns early
    // before that JSX exists) — re-run once `loading` flips so this doesn't
    // silently no-op forever by only depending on `open`.
    const el = sidebarScrollRef.current;
    if (!el) return;
    const check = () => setSidebarHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [open, loading]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const onChange = (event: MediaQueryListEvent) => {
      setSuppressSidebarTransition(true);
      setMobile(event.matches);
      setOpen(!event.matches);
      // Two rAFs: the first lets React commit the new classes/layout while
      // transitions are still suppressed, the second waits for that frame to
      // actually paint before re-enabling transitions for future toggles.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSuppressSidebarTransition(false));
      });
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
    <div className={`${open ? 'admin-shell admin-shell--sidebar-open' : 'admin-shell admin-shell--sidebar-closed'}${suppressSidebarTransition ? ' admin-shell--no-transition' : ''}`}>
      <div className={open ? 'admin-mobile-overlay admin-mobile-overlay--visible' : 'admin-mobile-overlay'} onClick={() => { setOpen(false); menuButtonRef.current?.focus(); }} />
      <aside ref={sidebarRef} id="admin-sidebar" className={open ? 'admin-sidebar admin-sidebar--open' : 'admin-sidebar'} aria-hidden={mobile && !open}>
        <div className="admin-sidebar__header">
          <Link className="admin-sidebar__brand" to="/admin" aria-label="Dashboard Papagayo" onClick={closeOnMobile}>
            <span className="admin-brand-logo admin-brand-logo--sidebar">
              <img src="/images/papagayo-logo.png" alt="" aria-hidden="true" />
            </span>
          </Link>
          <button className="admin-sidebar__toggle" type="button" aria-label={open ? 'Colapsar menu' : 'Expandir menu'} title={open ? 'Colapsar menu' : 'Expandir menu'} aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
        <div ref={sidebarScrollRef} className={sidebarHasMoreBelow ? 'admin-sidebar__scroll admin-sidebar__scroll--has-more' : 'admin-sidebar__scroll'}>
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
            <button ref={menuButtonRef} className="admin-topbar__menu" type="button" aria-label="Abrir menu" title="Abrir menu" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(true)}>
              <Menu size={19} aria-hidden="true" />
            </button>
            <div className="admin-topbar__titles">
              <h1 className="admin-topbar__title">{title}</h1>
              <div className="admin-topbar__crumb">{crumb}</div>
            </div>
            <Link className="admin-icon-btn" to="/" aria-label="Ver sitio publico" title="Ver sitio publico">
              <Globe2 size={18} aria-hidden="true" />
            </Link>
            <ThemeToggle />
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
