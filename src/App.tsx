import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  );
}
