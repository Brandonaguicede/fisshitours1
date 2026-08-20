import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Globe2, Loader2, PenLine, Quote, Send, Star, User, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { MOCK_TURNSTILE_TOKEN, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { submitReview } from '../../services/reviewService';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { TurnstileBox } from '../common/TurnstileBox';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
}

const panelClassName = 'max-w-2xl overflow-hidden rounded-[2rem] border border-white/15 bg-[#061B2F] text-white shadow-lifted';

export function ReviewModal({ open, onClose }: ReviewModalProps) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [quote, setQuote] = useState('');
  const [rating, setRating] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setCountry('');
    setQuote('');
    setRating(0);
    setTurnstileToken('');
    setFormError('');
    setSubmitted(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', 'approved'] });
      setSubmitted(true);
    },
    onError: () => {
      setTurnstileToken('');
      setTurnstileResetKey((value) => value + 1);
    },
  });

  const t = (es: string, en: string) => (language === 'es' ? es : en);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');

    if (rating < 1) {
      setFormError(t('Elige cuántas estrellas le das a tu experiencia.', 'Select how many stars you rate your experience.'));
      return;
    }
    if (name.trim().length < 2) {
      setFormError(t('Escribe tu nombre para que sepamos quién nos visitó.', 'Tell us your name so we know who joined us.'));
      return;
    }
    if (quote.trim().length < 10) {
      setFormError(t('Cuéntanos un poco más (al menos 10 caracteres).', 'Tell us a bit more (at least 10 characters).'));
      return;
    }
    if (!USE_LOCAL_TURNSTILE_MOCK && !turnstileToken) {
      setFormError(t('Completa la verificación para enviar.', 'Complete the verification to continue.'));
      return;
    }

    mutation.mutate({
      name: name.trim(),
      country: country.trim() || undefined,
      quote: quote.trim(),
      rating,
      turnstileToken: USE_LOCAL_TURNSTILE_MOCK ? MOCK_TURNSTILE_TOKEN : turnstileToken,
    });
  }

  if (submitted) {
    return (
      <Modal open={open} onClose={onClose} titleId="review-modal-title" className={panelClassName}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(226,168,109,0.18),transparent_13rem),radial-gradient(circle_at_80%_20%,rgba(110,172,201,0.16),transparent_16rem)]" />
        <button className="focus-ring pressable absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ocean-200 transition-colors duration-200 hover:bg-white/10" type="button" aria-label={t('Cerrar', 'Close')} onClick={onClose}>
          <X size={17} />
        </button>
        <div className="relative px-6 py-10 text-center sm:px-10 sm:py-12">
          <motion.span
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-seafoam-400 to-ocean-400 text-ocean-950 shadow-lifted"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18 }}
          >
            <Check size={28} strokeWidth={3} />
          </motion.span>
          <h2 id="review-modal-title" className="mt-6 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
            {t('¡Gracias', 'Thank you')}, <span className="font-serifDisplay text-[1.16em] font-normal italic text-ocean-300">{name.split(' ')[0]}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ocean-200">
            {t('Tu comentario fue enviado a nuestro equipo para revisión. Lo publicaremos aquí en cuanto esté aprobado.', 'Your review was sent to our team for review. We’ll publish it here once it’s approved.')}
          </p>
          <Button className="mt-7" type="button" onClick={onClose}>{t('Listo', 'Done')}</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} titleId="review-modal-title" className={panelClassName}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(226,168,109,0.18),transparent_15rem),radial-gradient(circle_at_8%_18%,rgba(110,172,201,0.18),transparent_17rem),linear-gradient(160deg,rgba(43,95,130,0.30),transparent_45%)]" />
      <button className="focus-ring pressable absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ocean-200 transition-colors duration-200 hover:bg-white/10" type="button" aria-label={t('Cerrar', 'Close')} onClick={onClose}>
        <X size={17} />
      </button>

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <header className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl sm:p-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-seafoam-400/25 bg-seafoam-400/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-seafoam-400">
            <PenLine size={12} /> {t('Comentarios', 'Reviews')}
          </span>
          <h2 id="review-modal-title" className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-[2rem]">
            {t('Cuéntanos tu', 'Share your')} <span className="font-serifDisplay text-[1.16em] font-normal italic text-ocean-300">{t('experiencia', 'experience')}</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ocean-200">
            {t('Tu comentario llega a nuestro panel de administración y, una vez aprobado, aparece aquí con los demás viajeros.', 'Your review goes to our admin panel and, once approved, appears here with other travelers.')}
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-300">{t('Tu calificación', 'Your rating')}</p>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('Nombre', 'Name')}
              <span className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
                <input className="focus-ring w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-300 focus:ring-4 focus:ring-ocean-500/15" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Tu nombre', 'Your name')} autoComplete="name" />
              </span>
            </label>

            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('País', 'Country')} <span className="font-semibold normal-case tracking-normal text-ocean-500">({t('opcional', 'optional')})</span>
              <span className="relative">
                <Globe2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" size={17} />
                <input className="focus-ring w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-300 focus:ring-4 focus:ring-ocean-500/15" value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t('Costa Rica', 'Costa Rica')} autoComplete="country-name" />
              </span>
            </label>

            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('Tu comentario', 'Your review')}
              <span className="relative">
                <Quote className="pointer-events-none absolute left-4 top-3 text-ocean-500" size={17} />
                <textarea className="focus-ring min-h-[7rem] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-4 text-sm font-medium normal-case tracking-normal text-white placeholder:text-ocean-500 focus:border-ocean-300 focus:ring-4 focus:ring-ocean-500/15" rows={4} value={quote} onChange={(event) => setQuote(event.target.value)} placeholder={t('¿Qué fue lo mejor de tu día en el océano?', 'What was the best part of your day on the ocean?')} />
              </span>
            </label>
          </div>

          <div className="mt-5">
            <TurnstileBox token={turnstileToken} resetKey={turnstileResetKey} action="review" onTokenChange={setTurnstileToken} />
          </div>

          {formError || mutation.isError ? (
            <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100" role="alert">
              {mutation.isError ? t('No pudimos enviar tu comentario. Inténtalo de nuevo.', 'We couldn’t send your review. Please try again.') : formError}
            </div>
          ) : null}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" disabled={mutation.isPending} onClick={onClose}>{t('Cancelar', 'Cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending || rating < 1}>
              {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {mutation.isPending ? t('Enviando…', 'Sending…') : t('Enviar comentario', 'Send review')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const { language } = useLanguage();
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label={language === 'es' ? 'Calificación' : 'Rating'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={cn(
            'focus-ring pressable grid h-11 w-11 place-items-center rounded-full border transition-all duration-200',
            star <= active
              ? 'border-seafoam-400/35 bg-seafoam-400/12 text-seafoam-400 shadow-[0_10px_22px_rgba(226,168,109,0.12)]'
              : 'border-white/10 bg-white/[0.035] text-white/25 hover:border-white/20 hover:text-white/50',
          )}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? (language === 'es' ? 'estrella' : 'star') : (language === 'es' ? 'estrellas' : 'stars')}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        >
          <Star className="fill-current" size={22} />
        </button>
      ))}
    </div>
  );
}
