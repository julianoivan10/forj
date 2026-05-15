import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'size-4',
    md: 'size-6',
    lg: 'size-10',
  };
  return (
    <Loader2
      className={cn(
        'animate-spin text-[var(--color-brand-primary)]',
        sizes[size],
        className,
      )}
    />
  );
}
