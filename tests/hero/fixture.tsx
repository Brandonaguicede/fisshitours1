import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Hero } from '../../src/components/home/Hero';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import '../../src/index.css';
createRoot(document.getElementById('fixture-root')!).render(<QueryClientProvider client={new QueryClient()}><LanguageProvider><MemoryRouter><Hero /></MemoryRouter></LanguageProvider></QueryClientProvider>);
