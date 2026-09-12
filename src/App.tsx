import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { BookingSelectionProvider } from './contexts/BookingSelectionContext';
import { AppRoutes } from './routes/AppRoutes';

function LoadingFallback() {
  const language = typeof window !== 'undefined' && window.localStorage.getItem('language') !== 'es' ? 'en' : 'es';
  return <div>{language === 'es' ? 'Cargando...' : 'Loading...'}</div>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BookingSelectionProvider>
          <Suspense fallback={<LoadingFallback />}>
            <AppRoutes />
          </Suspense>
        </BookingSelectionProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
