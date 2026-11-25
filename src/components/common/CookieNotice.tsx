import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import { applyConsent, getConsent, storedConsent, type Consent } from '../../analytics/consent';

export function CookieNotice() {
  const { language } = useLanguage();
  const t = (es: string, en: string) => language === 'es' ? es : en;
  const [visible, setVisible] = useState(() => !storedConsent());
  const [customize, setCustomize] = useState(false);
  const [choice, setChoice] = useState(getConsent);
  const reopen = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => setChoice(getConsent());
    window.addEventListener('pft-consent-change', sync);
    return () => window.removeEventListener('pft-consent-change', sync);
  }, []);
  function save(value: Consent) {
    applyConsent(value);
    setVisible(false);
    setCustomize(false);
    requestAnimationFrame(() => reopen.current?.focus({ preventScroll: true }));
  }
  const button = 'rounded-xl border border-ocean-700 px-4 py-2.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-700';
  return <>
    <button ref={reopen} type="button" className="fixed bottom-2 left-3 z-[79] rounded-lg bg-white px-3 py-2 text-sm text-ocean-950 shadow-md focus-visible:outline focus-visible:outline-2" onClick={() => { setChoice(getConsent()); setVisible(true); setCustomize(true); }}>
      Cookies
    </button>
    {visible && <aside role="region" aria-labelledby="cookie-heading" className="fixed inset-x-3 bottom-14 z-[80] mx-auto max-h-[75dvh] max-w-3xl overflow-y-auto rounded-2xl bg-[#f8fbfc] p-5 text-ocean-950 shadow-xl">
      <h2 id="cookie-heading" className="text-lg font-bold">{t('Preferencias de cookies', 'Cookie preferences')}</h2>
      <Link className="mt-2 inline-block underline" to="/privacidad">{t('Privacidad y conservación de datos', 'Privacy and data retention')}</Link>
      <p className="mt-2 text-base leading-6">{t('Las cookies necesarias permiten reservar y pagar. Con tu permiso, Google mide las visitas y Google Ads y Meta miden publicidad. Puedes rechazar o cambiar tu decisión en cualquier momento.', 'Necessary cookies support booking and payment. With your permission, Google measures visits and Google Ads and Meta measure advertising. You can reject or change your choice at any time.')}</p>
      {customize && <fieldset className="my-4 grid gap-3">
        <legend className="mb-2 font-semibold">{t('Elige las categorías', 'Choose categories')}</legend>
        <p>{t('Necesarias: siempre activas', 'Necessary: always active')}</p>
        <label className="flex min-h-11 items-center gap-3"><input className="h-5 w-5" type="checkbox" checked={choice.analytics} onChange={e => setChoice({ ...choice, analytics: e.target.checked })} />{t('Analítica de visitas', 'Visit analytics')}</label>
        <label className="flex min-h-11 items-center gap-3"><input className="h-5 w-5" type="checkbox" checked={choice.marketing} onChange={e => setChoice({ ...choice, marketing: e.target.checked })} />{t('Publicidad y conversiones', 'Advertising and conversions')}</label>
      </fieldset>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={button} type="button" onClick={() => save({ analytics: true, marketing: true })}>{t('Aceptar', 'Accept')}</button>
        <button className={button} type="button" onClick={() => save({ analytics: false, marketing: false })}>{t('Rechazar', 'Reject')}</button>
        <button className={button} type="button" aria-expanded={customize} onClick={() => setCustomize(!customize)}>{t('Personalizar', 'Customize')}</button>
        {customize && <button className={button} type="button" onClick={() => save(choice)}>{t('Guardar preferencias', 'Save preferences')}</button>}
      </div>
    </aside>}
  </>;
}
