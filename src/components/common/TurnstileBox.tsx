import { useEffect, useRef, useState } from 'react';

import { MOCK_TURNSTILE_TOKEN, TURNSTILE_SITE_KEY, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { cn } from '../../utils/cn';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; action?: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

interface TurnstileBoxProps {
  token: string;
  resetKey: number;
  action?: string;
  className?: string;
  onTokenChange: (token: string) => void;
}

export function TurnstileBox({ token, resetKey, action = 'booking', className, onTokenChange }: TurnstileBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>();
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (USE_LOCAL_TURNSTILE_MOCK) {
      setLoadState('ready');
      onTokenChange(MOCK_TURNSTILE_TOKEN);
      return;
    }
    if (!TURNSTILE_SITE_KEY) {
      setLoadState('error');
      onTokenChange('');
      return;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      containerRef.current.innerHTML = '';
      setLoadState('ready');
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => {
          setLoadState('error');
          onTokenChange('');
        },
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (window.turnstile) {
      renderWidget();
    } else if (existing) {
      setLoadState('loading');
      existing.addEventListener('load', renderWidget, { once: true });
      existing.addEventListener('error', () => setLoadState('error'), { once: true });
    } else {
      setLoadState('loading');
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.onload = renderWidget;
      script.onerror = () => {
        if (!cancelled) setLoadState('error');
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, [resetKey, retryKey, action, onTokenChange]);

  return (
    <div className={cn('rounded-xl border border-white/10 bg-ocean-950/30 p-3 sm:p-4', className)}>
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">Human verification</p>
      {USE_LOCAL_TURNSTILE_MOCK ? (
        <p className="mt-2 text-sm font-semibold text-ocean-200">Local verification mock is active.</p>
      ) : TURNSTILE_SITE_KEY ? (
        <div className="mt-3 max-w-full overflow-hidden">
          <div ref={containerRef} />
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-red-200">Human verification is not configured.</p>
      )}
      {!USE_LOCAL_TURNSTILE_MOCK && TURNSTILE_SITE_KEY && loadState === 'loading' ? <p className="mt-2 text-xs font-semibold text-ocean-300">Loading verification...</p> : null}
      {!USE_LOCAL_TURNSTILE_MOCK && TURNSTILE_SITE_KEY && loadState === 'error' ? (
        <button
          className="mt-2 text-xs font-extrabold text-red-100 underline"
          type="button"
          onClick={() => {
            document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]')?.remove();
            setRetryKey((value) => value + 1);
          }}
        >
          Retry human verification
        </button>
      ) : null}
      {!USE_LOCAL_TURNSTILE_MOCK && TURNSTILE_SITE_KEY && !token ? <p className="mt-2 text-xs font-semibold text-ocean-300">Complete verification to continue.</p> : null}
    </div>
  );
}
