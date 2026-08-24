import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Globe2, Loader2, PenLine, Quote, Send, Star, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { MOCK_TURNSTILE_TOKEN, USE_LOCAL_TURNSTILE_MOCK } from '../../lib/turnstile';
import { submitReview } from '../../services/reviewService';
import { cn } from '../../utils/cn';
import { TurnstileBox } from '../common/TurnstileBox';
import { Badge, Button, CloseButton, FieldError, GlassPanel, Input, ModalShell, TextArea } from '../ui';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
}

const panelClassName = 'max-w-2xl overflow-hidden text-white';

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
      <ModalShell open={open} onClose={onClose} titleId="review-modal-title" className={panelClassName}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(226,168,109,0.18),transparent_13rem),radial-gradient(circle_at_80%_20%,rgba(110,172,201,0.16),transparent_16rem)]" />
        <CloseButton className="absolute right-4 top-4 z-10 text-ocean-200" label={t('Cerrar', 'Close')} onClick={onClose} />
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
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={onClose} titleId="review-modal-title" className={panelClassName}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(226,168,109,0.18),transparent_15rem),radial-gradient(circle_at_8%_18%,rgba(110,172,201,0.18),transparent_17rem),linear-gradient(160deg,rgba(43,95,130,0.30),transparent_45%)]" />
      <CloseButton className="absolute right-4 top-4 z-10 text-ocean-200" label={t('Cerrar', 'Close')} onClick={onClose} />

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <GlassPanel as="section" className="p-5 sm:p-6" variant="surface">
          <Badge className="gap-1.5 uppercase tracking-[0.14em]" variant="subtle">
            <PenLine size={12} /> {t('Comentarios', 'Reviews')}
          </Badge>
          <h2 id="review-modal-title" className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-[2rem]">
            {t('Cuéntanos tu', 'Share your')} <span className="font-serifDisplay text-[1.16em] font-normal italic text-ocean-300">{t('experiencia', 'experience')}</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ocean-200">
            {t('Tu comentario llega a nuestro panel de administración y, una vez aprobado, aparece aquí con los demás viajeros.', 'Your review goes to our admin panel and, once approved, appears here with other travelers.')}
          </p>
        </GlassPanel>

        <form onSubmit={handleSubmit} noValidate>
          <GlassPanel className="mt-5 p-4" variant="subtle">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-300">{t('Tu calificación', 'Your rating')}</p>
            <StarRating value={rating} onChange={setRating} />
          </GlassPanel>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('Nombre', 'Name')}
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Tu nombre', 'Your name')} autoComplete="name" shape="soft" startIcon={<User size={17} />} />
            </label>

            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('País', 'Country')} <span className="font-semibold normal-case tracking-normal text-ocean-500">({t('opcional', 'optional')})</span>
              <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t('Costa Rica', 'Costa Rica')} autoComplete="country-name" shape="soft" startIcon={<Globe2 size={17} />} />
            </label>

            <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-400">
              {t('Tu comentario', 'Your review')}
              <TextArea className="min-h-[7rem]" rows={4} value={quote} onChange={(event) => setQuote(event.target.value)} placeholder={t('¿Qué fue lo mejor de tu día en el océano?', 'What was the best part of your day on the ocean?')} startIcon={<Quote size={17} />} />
            </label>
          </div>

          <div className="mt-5">
            <TurnstileBox token={turnstileToken} resetKey={turnstileResetKey} action="review" onTokenChange={setTurnstileToken} />
          </div>

          {formError || mutation.isError ? <FieldError className="mt-4" variant="panel">{mutation.isError ? t('No pudimos enviar tu comentario. Inténtalo de nuevo.', 'We couldn’t send your review. Please try again.') : formError}</FieldError> : null}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="glass" type="button" disabled={mutation.isPending} onClick={onClose}>{t('Cancelar', 'Cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending || rating < 1}>
              {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {mutation.isPending ? t('Enviando…', 'Sending…') : t('Enviar comentario', 'Send review')}
            </Button>
          </div>
        </form>
      </div>
    </ModalShell>
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
            'glass-control glass-interactive glass-focus-ring grid h-11 w-11 place-items-center rounded-full',
            star <= active
              ? 'text-seafoam-400'
              : 'text-white/25',
          )}
          type="button"
          role="radio"
          aria-checked={value === star}
          data-selected={star <= active || undefined}
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
