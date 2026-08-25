import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
