import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { MainLayout } from '../components/layout/MainLayout';

const HomePage = lazy(() => import('../pages/HomePage'));
const BookingPage = lazy(() => import('../pages/BookingPage'));
const ToursPage = lazy(() => import('../pages/ToursPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
const AdminLayout = lazy(() => import('../components/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const AdminReservationsPage = lazy(() => import('../pages/admin/AdminReservationsPage'));
const AdminToursPage = lazy(() => import('../pages/admin/AdminToursPage'));
const AdminBoatsPage = lazy(() => import('../pages/admin/AdminBoatsPage'));
const AdminBoatToursPage = lazy(() => import('../pages/admin/AdminBoatToursPage'));
const AdminReviewsPage = lazy(() => import('../pages/admin/AdminReviewsPage'));
const AdminGalleryPage = lazy(() => import('../pages/admin/AdminGalleryPage'));
const AdminPortadaPage = lazy(() => import('../pages/admin/AdminPortadaPage'));
const AdminAboutPage = lazy(() => import('../pages/admin/AdminAboutPage'));
const AdminPaymentMethodsPage = lazy(() => import('../pages/admin/AdminPaymentMethodsPage'));
const AdminDepartureLocationsPage = lazy(() => import('../pages/admin/AdminDepartureLocationsPage'));

// /admin/content used to hold Hero and About as two tabs. Old bookmarks land on Portada, except when they
// explicitly asked for the About tab (?tab=about), which now lives on its own screen.
function LegacyContentRedirect() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const wantsAbout = ['about', 'nosotros', 'sobre-nosotros'].includes((params.get('tab') ?? '').toLowerCase());
  params.delete('tab');
  const rest = params.toString();
  return <Navigate to={`${wantsAbout ? '/admin/sobre-nosotros' : '/admin/portada'}${rest ? `?${rest}` : ''}${hash}`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="admin/login" element={<AdminLoginPage />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="reservations" element={<AdminReservationsPage />} />
        <Route path="tours" element={<AdminToursPage />} />
        <Route path="boats" element={<AdminBoatsPage />} />
        <Route path="boat-tours" element={<AdminBoatToursPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="gallery" element={<AdminGalleryPage />} />
        {/* Destinos was removed as a product feature — kept as a redirect so any old bookmark/link doesn't 404. */}
        <Route path="destinations" element={<Navigate to="/admin" replace />} />
        <Route path="portada" element={<AdminPortadaPage />} />
        <Route path="sobre-nosotros" element={<AdminAboutPage />} />
        {/* Hero and About used to share /admin/content as two tabs; kept as a redirect so old links/bookmarks keep working. */}
        <Route path="content" element={<LegacyContentRedirect />} />
        {/* Videos lived under content before the Portada screen grouped Media (photos + video); same reason. */}
        <Route path="videos" element={<Navigate to="/admin/portada" replace />} />
        <Route path="payment-methods" element={<AdminPaymentMethodsPage />} />
        <Route path="departure-locations" element={<AdminDepartureLocationsPage />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="reservar" element={<BookingPage />} />
        <Route path="tours" element={<ToursPage />} />
        <Route path="tours/:slug" element={<Navigate to="/tours" replace />} />
        <Route path="contacto" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
