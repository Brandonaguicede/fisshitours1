import { useEffect, useState } from 'react';

const COOKIE_KEY = 'papagayo-cookie-consent';

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(COOKIE_KEY) !== 'accepted');
  }, []);

  if (!visible) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-2xl border border-white/15 bg-ocean-950/95 p-4 text-white shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:flex sm:items-center sm:gap-5 sm:px-5">
      <p className="text-sm leading-6 text-ocean-100">
        Usamos cookies necesarias para recordar preferencias y mantener segura tu sesión. Al continuar aceptas su uso.
      </p>
      <button
        type="button"
        className="mt-3 shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-ocean-950 transition hover:bg-ocean-100 sm:mt-0"
        onClick={() => {
          window.localStorage.setItem(COOKIE_KEY, 'accepted');
          setVisible(false);
        }}
      >
        Aceptar
      </button>
    </aside>
  );
}
