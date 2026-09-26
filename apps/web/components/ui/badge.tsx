import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium ' +
    'transition-colors [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'bg-transparent text-[var(--color-text-secondary)] border border-[var(--color-border-default)]',
        brand:
          'bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)] border border-[var(--color-border-brand)]',
        success:
          'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30',
        warning:
          'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30',
        error:
          'bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/30',
        outline: 'border border-[var(--color-border-strong)] text-[var(--color-text-primary)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
