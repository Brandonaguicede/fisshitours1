import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { BookingSelectionProvider } from './contexts/BookingSelectionContext';
import { SeoMetadata } from './components/common/SeoMetadata';
import { AppRoutes } from './routes/AppRoutes';
import { getStoredLanguage } from './i18n/LanguageContext';

function LoadingFallback() {
  const language = getStoredLanguage();
  return <div>{language === 'es' ? 'Cargando...' : 'Loading...'}</div>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SeoMetadata />
        <BookingSelectionProvider>
          <Suspense fallback={<LoadingFallback />}>
            <AppRoutes />
          </Suspense>
        </BookingSelectionProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
