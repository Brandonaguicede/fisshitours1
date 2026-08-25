import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AboutPage from './pages/AboutPage';
import { AboutPreview } from './components/home/AboutPreview';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';

const qc = new QueryClient();

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('127.0.0.1:54321')) {
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return realFetch(input, init);
};

const params = new URLSearchParams(window.location.search);
const target = params.get('view') ?? 'about';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter>
          {target === 'preview' ? <AboutPreview /> : <AboutPage />}
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
);
