import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { MainLayout } from '../components/layout/MainLayout';

const HomePage = lazy(() => import('../pages/HomePage'));
const ToursPage = lazy(() => import('../pages/ToursPage'));
const TourDetailPage = lazy(() => import('../pages/TourDetailPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
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
const AdminDestinationsPage = lazy(() => import('../pages/admin/AdminDestinationsPage'));
const AdminContentPage = lazy(() => import('../pages/admin/AdminContentPage'));
const AdminPaymentMethodsPage = lazy(() => import('../pages/admin/AdminPaymentMethodsPage'));
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage'));

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
        <Route path="destinations" element={<AdminDestinationsPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="payment-methods" element={<AdminPaymentMethodsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="tours" element={<ToursPage />} />
        <Route path="tours/:slug" element={<TourDetailPage />} />
        <Route path="nosotros" element={<AboutPage />} />
        <Route path="contacto" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
