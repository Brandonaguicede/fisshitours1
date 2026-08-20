import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (USE_LOCAL_TURNSTILE_MOCK) {
      onTokenChange(MOCK_TURNSTILE_TOKEN);
      return;
    }
    if (!TURNSTILE_SITE_KEY) {
      onTokenChange('');
      return;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      containerRef.current.innerHTML = '';
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => onTokenChange(''),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (existing) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
    };
  }, [resetKey, action]);

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
      {!USE_LOCAL_TURNSTILE_MOCK && TURNSTILE_SITE_KEY && !token ? <p className="mt-2 text-xs font-semibold text-ocean-300">Complete verification to continue.</p> : null}
    </div>
  );
}