'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ' +
    'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-[var(--color-background)] ' +
    'disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] ' +
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        // Solid vermillion fill — Bauhaus prefers flat colour over
        // gradient sheen. White type on vermillion passes AA at all
        // sizes; the soft warm glow on hover replaces the cyan shimmer
        // we used to ship under the old palette.
        primary:
          'bg-[var(--color-brand-primary)] text-white font-semibold ' +
          'shadow-[0_0_20px_var(--color-glow-brand)] ' +
          'hover:bg-[#c73e1d] hover:shadow-[0_0_40px_var(--color-glow-brand-strong)]',
        secondary:
          'bg-[var(--color-background-elevated)] text-[var(--color-text-primary)] ' +
          'border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] ' +
          'hover:bg-[var(--color-background-tertiary)]',
        ghost:
          'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] ' +
          'hover:bg-[var(--color-background-elevated)]',
        outline:
          'border border-[var(--color-border-brand)] text-[var(--color-brand-primary)] ' +
          'hover:bg-[var(--color-glow-brand)]',
        destructive:
          'bg-[var(--color-error)]/15 text-[var(--color-error)] border border-[var(--color-error)]/30 ' +
          'hover:bg-[var(--color-error)]/25',
        link: 'text-[var(--color-brand-primary)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm rounded-[var(--radius-sm)] [&_svg]:size-4',
        md: 'h-10 px-4 text-sm rounded-[var(--radius-md)] [&_svg]:size-4',
        lg: 'h-12 px-6 text-base rounded-[var(--radius-md)] [&_svg]:size-5',
        xl: 'h-14 px-8 text-base rounded-[var(--radius-lg)] [&_svg]:size-5',
        icon: 'h-10 w-10 rounded-[var(--radius-md)] [&_svg]:size-4',
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
