import { Component, type ErrorInfo, type ReactNode } from 'react';

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
      return (
        <main className="grid min-h-screen place-items-center bg-ocean-950 px-6 text-center text-white">
          <section className="max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-6">
            <h1 className="text-2xl font-extrabold">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-ocean-100">Please refresh the page or try again in a moment.</p>
            <button className="mt-5 rounded-xl bg-ocean-400 px-4 py-2 text-sm font-extrabold text-ocean-950" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
