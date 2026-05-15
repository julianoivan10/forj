import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-md)]',
        'bg-[var(--color-background-elevated)]',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-gradient-to-r before:from-transparent',
        'before:via-white/5 before:to-transparent',
        'before:animate-[shimmer_2s_linear_infinite]',
        className,
      )}
      {...props}
    />
  );
}
