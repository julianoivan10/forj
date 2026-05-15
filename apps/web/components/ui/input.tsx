'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', leftIcon, rightIcon, error, ...props }, ref) => {
    const wrapperClasses = cn(
      'group relative flex w-full items-center h-11 rounded-[var(--radius-md)] transition-colors duration-200',
      'bg-[var(--color-background-elevated)] border',
      error
        ? 'border-[var(--color-error)]/50 focus-within:border-[var(--color-error)]'
        : 'border-[var(--color-border-default)] focus-within:border-[var(--color-brand-primary)] focus-within:shadow-[0_0_0_3px_var(--color-glow-brand)]',
    );

    return (
      <div className={wrapperClasses}>
        {leftIcon && (
          <span className="pl-3 text-[var(--color-text-tertiary)] [&>svg]:size-4">{leftIcon}</span>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--color-text-primary)]',
            'placeholder:text-[var(--color-text-tertiary)]',
            'focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
            leftIcon && 'pl-2',
            rightIcon && 'pr-2',
            className,
          )}
          {...props}
        />
        {rightIcon && (
          <span className="pr-3 text-[var(--color-text-tertiary)] [&>svg]:size-4">{rightIcon}</span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full min-h-[100px] rounded-[var(--radius-md)] bg-[var(--color-background-elevated)] border',
        'px-3 py-3 text-sm text-[var(--color-text-primary)]',
        'placeholder:text-[var(--color-text-tertiary)] transition-colors duration-200',
        'focus:outline-none resize-y',
        error
          ? 'border-[var(--color-error)]/50 focus:border-[var(--color-error)]'
          : 'border-[var(--color-border-default)] focus:border-[var(--color-brand-primary)] focus:shadow-[0_0_0_3px_var(--color-glow-brand)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';
