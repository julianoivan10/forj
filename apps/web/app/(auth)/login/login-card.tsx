'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Wallet, ChevronRight } from 'lucide-react';
import { useAuth, hasPrivy, type LoginMethod } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LoginCardProps {
  /** "signin" disables Privy signup → only existing users can complete the flow.
   *  "signup" leaves it open and tweaks copy for new users. */
  mode?: 'signin' | 'signup';
}

const METHOD_OPTIONS: Array<{
  method: LoginMethod;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
}> = [
  {
    method: 'email',
    label: 'Continue with Email',
    hint: 'Magic link sent to your inbox',
    icon: Mail,
    primary: true,
  },
  {
    method: 'google',
    label: 'Continue with Google',
    hint: 'Use your Google account',
    icon: GoogleIcon,
  },
  {
    method: 'wallet',
    label: 'Connect Wallet',
    hint: 'MetaMask, Coinbase, WalletConnect',
    icon: Wallet,
  },
];

export function LoginCard({ mode = 'signin' }: LoginCardProps) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const { isReady, isAuthenticated, needsOnboarding, login, isLoading, user } = useAuth();

  // Auto-redirect once authenticated.
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    if (!user) return; // wait until DB user loaded
    if (needsOnboarding) {
      router.replace('/onboarding');
    } else {
      router.replace(next);
    }
  }, [isReady, isAuthenticated, needsOnboarding, user, next, router]);

  const handleLogin = (method: LoginMethod) => {
    if (!isReady) return;
    try {
      login({
        loginMethods: [method],
        // For "signin" mode, prevent first-time users from creating an account
        // here — we want the explicit /signup page for that.
        disableSignup: mode === 'signin',
      });
    } catch {
      /* Privy emits an error event we catch via useLogin's onError if needed.
         For now silently let it surface in console — user can retry. */
    }
  };

  const headline = mode === 'signup' ? 'Create your account' : 'Welcome back';
  const subhead =
    mode === 'signup'
      ? "Pick how you'd like to sign up. We'll create a wallet for you automatically."
      : 'Sign in to your Forj account.';

  // Show a soft loading state while Privy hands off after a successful sign-in.
  const isSigningIn = isAuthenticated && isLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-[440px]"
    >
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/80 p-7 sm:p-8">
        {/* Network chip */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
            <span className="inline-block size-1.5 rounded-full bg-[var(--color-brand-primary)]" />
            Base Network
          </span>
        </div>

        {/* Heading */}
        <div className="mt-5 text-center">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            {mode === 'signup' ? (
              <>Join <span className="text-gradient-brand">Forj</span></>
            ) : (
              <>{headline.split(' ')[0]} <span className="text-gradient-brand">{headline.split(' ').slice(1).join(' ')}</span></>
            )}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{subhead}</p>
        </div>

        {!hasPrivy ? (
          <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-warning)]">
            Privy credentials are not configured. Set <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code> in <code className="font-mono">.env</code>.
          </div>
        ) : isSigningIn ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-6">
            <Spinner className="size-6" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Signing you in…
            </p>
          </div>
        ) : (
          <div className="mt-7 space-y-2.5">
            {METHOD_OPTIONS.map((opt) => (
              <MethodButton
                key={opt.method}
                onClick={() => handleLogin(opt.method)}
                disabled={!isReady}
                icon={<opt.icon className="size-5" />}
                label={opt.label}
                hint={opt.hint}
                primary={opt.primary}
              />
            ))}
          </div>
        )}

        {/* Mode swap link */}
        {hasPrivy && !isSigningIn && (
          <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <Link
                  href={{ pathname: '/login', query: next !== '/dashboard' ? { next } : undefined }}
                  className="font-medium text-[var(--color-brand-primary)] underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to Forj?{' '}
                <Link
                  href={{ pathname: '/signup', query: next !== '/dashboard' ? { next } : undefined }}
                  className="font-medium text-[var(--color-brand-primary)] underline-offset-4 hover:underline"
                >
                  Create an account
                </Link>
              </>
            )}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-[var(--color-text-tertiary)]">
          By continuing you agree to our{' '}
          <Link href="/terms" className="underline hover:text-[var(--color-text-secondary)]">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-[var(--color-text-secondary)]">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </motion.div>
  );
}

function MethodButton({
  onClick,
  disabled,
  icon,
  label,
  hint,
  primary,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        primary
          ? 'border-[var(--color-brand-primary)]/60 bg-[var(--color-glow-brand)] hover:border-[var(--color-brand-primary)] hover:from-[var(--color-brand-primary)]/25 hover:to-[var(--color-brand-secondary)]/15'
          : 'border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/50 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-background-tertiary)]',
      )}
    >
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
          primary
            ? 'bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-primary)]'
            : 'bg-[var(--color-text-primary)]/[0.04] text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
          {label}
        </span>
        <span className="block truncate text-xs text-[var(--color-text-tertiary)]">
          {hint}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text-secondary)]" />
    </button>
  );
}

// Inline Google brand glyph — keeps the chip visually distinct from generic icons.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.93h5.5c-.24 1.4-1.6 4.13-5.5 4.13-3.32 0-6.02-2.74-6.02-6.13S8.68 5.96 12 5.96c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.86 3.43 14.66 2.5 12 2.5 6.97 2.5 2.9 6.57 2.9 11.6S6.97 20.7 12 20.7c5.78 0 9.6-4.06 9.6-9.78 0-.66-.07-1.16-.16-1.66H12V10.2z"
      />
    </svg>
  );
}
