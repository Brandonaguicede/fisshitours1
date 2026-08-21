import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<main className="grid min-h-screen place-items-center bg-ocean-950 text-white">Loading Papagayo Fishing Tours...</main>}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
