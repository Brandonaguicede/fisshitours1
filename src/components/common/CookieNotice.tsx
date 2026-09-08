import { Cookie } from 'lucide-react';
import { useEffect, useState } from 'react';

const COOKIE_KEY = 'papagayo-cookie-consent';

function hasCookieConsent() {
  return document.cookie.split('; ').some((cookie) => cookie.startsWith(`${COOKIE_KEY}=accepted`))
    || window.localStorage.getItem(COOKIE_KEY) === 'accepted';
}

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasCookieConsent());
  }, []);

  if (!visible) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-4xl overflow-hidden rounded-[1.5rem] border border-ocean-200/70 bg-[#f8fbfc] p-4 text-ocean-950 shadow-[0_22px_60px_-24px_rgba(0,20,40,0.75)] sm:bottom-6 sm:flex sm:items-center sm:gap-5 sm:p-5" role="dialog" aria-label="Preferencias de cookies">
      <span className="mb-3 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ocean-100 text-ocean-700 sm:mb-0" aria-hidden="true">
        <Cookie size={19} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold tracking-tight text-ocean-950">Preferencias de cookies</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Usamos cookies necesarias para recordar tus preferencias y mantener segura tu sesión.
        </p>
      </div>
      <button
        type="button"
        className="mt-4 w-full shrink-0 rounded-xl bg-ocean-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ocean-800 focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:ring-offset-2 sm:mt-0 sm:w-auto"
        onClick={() => {
          document.cookie = `${COOKIE_KEY}=accepted; Max-Age=31536000; Path=/; SameSite=Lax`;
          window.localStorage.setItem(COOKIE_KEY, 'accepted');
          setVisible(false);
        }}
      >
        Aceptar
      </button>
    </aside>
  );
}
