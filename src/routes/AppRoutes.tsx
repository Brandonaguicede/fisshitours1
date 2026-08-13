import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { MainLayout } from '../components/layout/MainLayout';

const HomePage = lazy(() => import('../pages/HomePage'));
const ToursPage = lazy(() => import('../pages/ToursPage'));
const TourDetailPage = lazy(() => import('../pages/TourDetailPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export function AppRoutes() {
  return (
    <Routes>
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
