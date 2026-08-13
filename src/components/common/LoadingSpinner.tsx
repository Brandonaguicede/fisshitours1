import { cn } from '../../utils/cn';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
}

export function LoadingSpinner({ fullScreen = false }: LoadingSpinnerProps) {
  return (
    <div className={cn('grid place-items-center', fullScreen ? 'min-h-screen' : 'py-16')}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-ocean-100 border-t-ocean-600" aria-label="Cargando" />
    </div>
  );
}
