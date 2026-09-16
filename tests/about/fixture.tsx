import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AboutPreview } from '../../src/components/home/AboutPreview';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { DEFAULT_ABOUT_SETTINGS } from '../../src/services/aboutSettings';
import '../../src/index.css';
const client = new QueryClient();
client.setQueryData(['site-settings', 'about'], {...DEFAULT_ABOUT_SETTINGS,
 'about.carousel_1.image': '/test-first.svg', 'about.carousel_2.image': '/test-broken.svg',
 'about.carousel_3.image': '/test-third.svg', 'about.carousel_4.image': '', 'about.image': '',
});
createRoot(document.getElementById('fixture-root')!).render(<QueryClientProvider client={client}><LanguageProvider><MemoryRouter><AboutPreview /></MemoryRouter></LanguageProvider></QueryClientProvider>);
