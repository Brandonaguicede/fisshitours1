import { Check, X } from 'lucide-react';
import { useId, useState } from 'react';

import { CURRENT_TERMS_VERSION, getTerms } from '../../../supabase/functions/_shared/terms.mjs';
import type { Language } from '../../i18n/LanguageContext';
import { cn } from '../../utils/cn';
import { Button, ChoiceCard, ModalShell } from '../ui';

type Tone = 'glass' | 'light';

const copy = {
  es: { title: 'Términos y Condiciones', close: 'Cerrar', closeDialog: 'Cerrar Términos y Condiciones' },
  en: { title: 'Terms and Conditions', close: 'Close', closeDialog: 'Close Terms and Conditions' },
} as const;

/**
 * The structured policies of one published version (default: the current one) in a responsive dialog: centered with an inner scroll on
 * desktop, near full-screen on phones. It is a portal over the page, so the booking / admin form underneath keeps every value.
 */
export function TermsModal({ open, onClose, language, tone = 'glass', version = CURRENT_TERMS_VERSION }: { open: boolean; onClose: () => void; language: Language; tone?: Tone; version?: string }) {
  const titleId = useId();
  const text = copy[language];
  const terms = getTerms(version, language);
  const light = tone === 'light';
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      titleId={titleId}
      tone={tone}
      // `!` because .app-modal-panel (index.css, unlayered) hardcodes max-width / max-height and would beat the utilities.
      className={cn('!max-h-[calc(100dvh-1rem)] w-full !max-w-2xl overflow-hidden p-0 sm:!max-h-[min(88dvh,46rem)]', light ? 'text-slate-800' : 'text-white')}
    >
      <div data-terms-modal className="flex min-h-0 flex-1 flex-col">
        <header className={cn('flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4', light ? 'border-slate-200' : 'border-white/10')}>
          <div className="min-w-0">
            <h2 id={titleId} className={cn('text-lg font-extrabold leading-tight sm:text-xl', light ? 'text-slate-900' : 'text-white')}>{text.title}</h2>
            <p className={cn('mt-0.5 text-xs', light ? 'text-slate-500' : 'text-ocean-300')}>Papagayo Fishing Tours</p>
          </div>
          <button
            type="button"
            aria-label={text.closeDialog}
            onClick={onClose}
            className={cn('glass-focus-ring grid size-11 shrink-0 place-items-center rounded-lg transition', light ? 'text-slate-600 hover:bg-slate-100' : 'text-ocean-100 hover:bg-white/10')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div data-terms-body className={cn('thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5', light && 'thin-scroll--light')}>
          {terms.sections.map((section) => (
            <section key={section.id} className="mb-5 last:mb-0">
              <h3 className={cn('text-sm font-extrabold sm:text-base', light ? 'text-slate-900' : 'text-white')}>{section.title}</h3>
              <ul className={cn('mt-2 grid list-disc gap-1.5 pl-5 text-[0.82rem] leading-6 sm:text-sm', light ? 'text-slate-700' : 'text-ocean-100')}>
                {section.items.map((item) => <li key={item} className="break-words">{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <footer className={cn('flex shrink-0 justify-end border-t px-4 py-3 sm:px-6', light ? 'border-slate-200' : 'border-white/10')}>
          <Button variant={light ? 'primary' : 'glass'} type="button" onClick={onClose}>{text.close}</Button>
        </footer>
      </div>
    </ModalShell>
  );
}

const consentCopy = {
  public: {
    es: { label: 'He leído y acepto los Términos y Condiciones', view: 'Ver Términos y Condiciones', error: 'Acepta los Términos y Condiciones para continuar.' },
    en: { label: 'I have read and accept the Terms and Conditions', view: 'View Terms and Conditions', error: 'Please accept the Terms and Conditions to continue.' },
  },
  admin: {
    es: { label: 'El cliente aceptó los términos y condiciones por WhatsApp, teléfono u otro medio.', view: 'Ver Términos y Condiciones', error: 'Confirma que el cliente aceptó los términos y condiciones.' },
    en: { label: 'The customer accepted the terms and conditions by WhatsApp, phone or another channel.', view: 'View Terms and Conditions', error: 'Confirm that the customer accepted the terms and conditions.' },
  },
} as const;

/** A plain "View Terms and Conditions" access (no checkbox) that opens the same modal: the only way other screens show the policies. */
export function TermsLink({ language, className }: { language: Language; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-terms-link onClick={() => setOpen(true)} className={cn('glass-focus-ring min-h-[44px] rounded text-sm font-semibold underline underline-offset-4 sm:min-h-0', className ?? 'text-ocean-200 hover:text-white')}>
        {consentCopy.public[language].view}
      </button>
      <TermsModal open={open} onClose={() => setOpen(false)} language={language} />
    </>
  );
}

/**
 * Mandatory acceptance + "View Terms and Conditions" (opens TermsModal). It is a real checkbox (keyboard, screen readers, `required` semantics)
 * drawn with the same selection language as the packages / departure times of the booking: a glass ChoiceCard whose round check fills in
 * when selected. The native control is visually hidden, never shown. `variant="admin"` is the operator's confirmation on a manual booking.
 */
export function TermsConsent({ checked, onChange, showError, language, variant = 'public', id = 'booking-terms', className }: { checked: boolean; onChange: (checked: boolean) => void; showError: boolean; language: Language; variant?: 'public' | 'admin'; id?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const text = consentCopy[variant][language];
  const light = variant === 'admin';
  const errorId = `${id}-error`;
  const invalid = showError && !checked;
  const input = (
    <input
      id={id}
      type="checkbox"
      className="sr-only"
      checked={checked}
      aria-required="true"
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
  // Same round check as ChoiceCheck (packages, times, meals), placed on the left of the text.
  const indicator = (
    <span
      aria-hidden="true"
      data-terms-check
      className={cn(
        'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
        light
          ? checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-400 bg-white'
          : checked ? 'border-ocean-100 bg-ocean-100 text-ocean-950' : 'border-ocean-200/60',
      )}
    >
      {checked ? <Check size={12} strokeWidth={3} /> : null}
    </span>
  );
  return (
    <div className={className} data-terms-consent>
      {light ? (
        <label
          htmlFor={id}
          className={cn(
            'flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500',
            checked ? 'border-sky-600 bg-sky-50' : invalid ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white hover:border-slate-400',
          )}
        >
          {input}
          {indicator}
          <span className="min-w-0 text-sm font-semibold leading-snug text-slate-800">{text.label}</span>
        </label>
      ) : (
        <ChoiceCard
          as="label"
          htmlFor={id}
          selected={checked}
          shape="rounded"
          className={cn('flex min-h-[48px] cursor-pointer items-start gap-3 px-3 py-3', invalid && 'border border-red-300/70')}
        >
          {input}
          {indicator}
          <span className="min-w-0 text-sm font-bold leading-snug text-white">{text.label}</span>
        </ChoiceCard>
      )}
      {/* Aligned with the label text: card padding (px-3) + check (size-5) + gap (gap-3). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('glass-focus-ring mt-1 ml-11 min-h-[44px] rounded text-left text-sm font-semibold underline underline-offset-4 sm:min-h-0', light ? 'text-sky-700 hover:text-sky-900' : 'text-ocean-200 hover:text-white')}
      >
        {text.view}
      </button>
      {invalid ? <p id={errorId} role="alert" className={cn('mt-2 text-xs font-semibold', light ? 'text-red-700' : 'text-red-200')}>{text.error}</p> : null}
      <TermsModal open={open} onClose={() => setOpen(false)} language={language} tone={light ? 'light' : 'glass'} />
    </div>
  );
}
