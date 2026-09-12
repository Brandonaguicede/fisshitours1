import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';

// The browser's own scroll-restoration-on-reload races with the SPA's
// hash/anchor-driven scroll logic in MainLayout: on a hard reload it can
// silently override our `scrollTo(0)` with whatever offset the last session
// left behind, landing the page on an unrelated mid-scroll section. Our own
// routing already decides scroll position from the URL, so it is the only
// authority that should move the viewport.
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
