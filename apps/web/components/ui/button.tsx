'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ' +
    'transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-[var(--color-background)] ' +
    'disabled:pointer-events-none disabled:opacity-40 active:translate-y-px ' +
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        // Solid vermillion fill — Bauhaus prefers flat colour over
        // gradient sheen. White type on vermillion passes AA at all
        // sizes; the soft warm glow on hover replaces the cyan shimmer
        // we used to ship under the old palette.
        // Cobalt fill: the single "do this" affordance on a screen.
        primary:
          'bg-[var(--color-brand-primary)] text-[var(--color-on-brand)] font-semibold ' +
          'hover:bg-[var(--color-brand-secondary)]',
        // Ink outline: every other real action.
        secondary:
          'bg-transparent text-[var(--color-text-primary)] ' +
          'border border-[var(--color-text-primary)]/70 hover:border-[var(--color-text-primary)] ' +
          'hover:bg-[var(--color-text-primary)]/[0.04]',
        ghost:
          'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] ' +
          'hover:bg-[var(--color-text-primary)]/[0.05]',
        outline:
          'border border-[var(--color-border-brand)] text-[var(--color-brand-primary)] ' +
          'hover:bg-[var(--color-glow-brand)]',
        destructive:
          'border border-[var(--color-error)]/60 text-[var(--color-error)] ' +
          'hover:bg-[var(--color-error)]/[0.08]',
        link: 'text-[var(--color-brand-primary)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm rounded-[var(--radius-sm)] [&_svg]:size-4',
        md: 'h-10 px-4 text-sm rounded-[var(--radius-sm)] [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px] rounded-[var(--radius-sm)] [&_svg]:size-4',
        xl: 'h-14 px-8 text-base rounded-[var(--radius-sm)] [&_svg]:size-5',
        icon: 'h-10 w-10 rounded-[var(--radius-sm)] [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="animate-spin" /> : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
