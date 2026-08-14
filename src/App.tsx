import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-ocean-950" />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  );
}
