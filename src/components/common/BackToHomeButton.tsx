import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLanguage } from '../../i18n/LanguageContext';
import { IconButton } from '../ui';
import { cn } from '../../utils/cn';

interface BackToHomeButtonProps {
  className?: string;
}

/** Always returns to `/`, regardless of browser history — used on focused,
 * single-task pages (booking, contact) that intentionally skip the footer
 * and its own site navigation. */
export function BackToHomeButton({ className }: BackToHomeButtonProps) {
  const { language } = useLanguage();
  const navigate = useNavigate();

  return (
    <IconButton
      className={cn('mb-4', className)}
      icon={ArrowLeft}
      label={language === 'es' ? 'Volver al inicio' : 'Back to home'}
      onClick={() => navigate('/')}
      size="sm"
      variant="glass"
    />
  );
}
