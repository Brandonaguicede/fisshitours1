import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { AppRoutes } from './routes/AppRoutes';

function LoadingFallback() {
  const language = typeof window !== 'undefined' && window.localStorage.getItem('language') !== 'es' ? 'en' : 'es';
  return <div>{language === 'es' ? 'Cargando...' : 'Loading...'}</div>;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
