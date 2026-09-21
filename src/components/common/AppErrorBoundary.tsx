import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, GlassPanel } from '../ui';
import { getStoredLanguage } from '../../i18n/LanguageContext';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unexpected application error', {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      // A class component can't use useLanguage() — LanguageProvider sits
      // above this boundary in main.tsx and is unaffected by whatever threw
      // below it, but reading its context here needs `static contextType`
      // wiring we don't otherwise need. getStoredLanguage() reads the same
      // localStorage key LanguageProvider itself initializes from.
      const language = getStoredLanguage();
      return (
        <main className="grid min-h-screen place-items-center bg-ocean-950 px-6 text-center text-white">
          <GlassPanel as="section" className="max-w-md rounded-2xl p-6" variant="surface">
            <h1 className="text-2xl font-extrabold">{language === 'es' ? 'Algo salió mal' : 'Something went wrong'}</h1>
            <p className="mt-3 text-sm leading-6 text-ocean-100">{language === 'es' ? 'Actualiza la página o inténtalo de nuevo en un momento.' : 'Please refresh the page or try again in a moment.'}</p>
            <Button className="mt-5" type="button" onClick={() => window.location.reload()}>
              {language === 'es' ? 'Actualizar' : 'Reload'}
            </Button>
          </GlassPanel>
        </main>
      );
    }

    return this.props.children;
  }
}
