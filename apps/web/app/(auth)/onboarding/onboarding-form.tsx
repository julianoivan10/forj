'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Code2,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * The signup intent. Stored in `users.role` and used as a UX hint
 * (default dashboard tab, profile label, primary CTA on the home page).
 *
 * Note: this does NOT restrict what a user can do. Every account can post
 * jobs AND submit proposals — once you've completed work you can pivot to
 * hiring without flipping a setting. The role just tells us where to
 * land you on first login.
 */
type Role = 'client' | 'freelancer';

interface FormState {
  role: Role | null;
  username: string;
  displayName: string;
  bio: string;
  skills: string[];
  hourlyRate: string;
  country: string;
}

const ROLE_OPTIONS: Array<{
  value: Role;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}> = [
  {
    value: 'freelancer',
    icon: Code2,
    title: 'I want to work',
    description: 'Find clients, get paid in USDC, build a portable on-chain reputation.',
  },
  {
    value: 'client',
    icon: Briefcase,
    title: 'I want to hire',
    description: 'Post jobs, vet freelancers by their on-chain track record, pay via escrow.',
  },
];

const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

export function OnboardingForm() {
  const router = useRouter();
  const { user, refetchUser, isReady, isAuthenticated } = useAuth();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<FormState>({
    role: null,
    username: '',
    displayName: '',
    bio: '',
    skills: [],
    hourlyRate: '',
    country: '',
  });
  const [skillInput, setSkillInput] = useState('');

  // Pre-fill from the DB user when it arrives.
  useEffect(() => {
    if (!user) return;
    setState((s) => ({
      ...s,
      displayName: s.displayName || user.displayName || '',
      username: s.username || user.username || '',
    }));
  }, [user]);

  // If already onboarded, bounce to /dashboard.
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    if (user?.isOnboarded) {
      router.replace('/dashboard');
    }
  }, [isReady, isAuthenticated, user?.isOnboarded, router]);

  const isFreelancer = state.role === 'freelancer';
  const totalSteps = isFreelancer ? 3 : 2;
  const progress = ((step + 1) / (totalSteps + 1)) * 100;

  const debouncedUsername = useDebounce(state.username, 400);
  const usernameValid = USERNAME_PATTERN.test(debouncedUsername) && debouncedUsername.length >= 3;

  const availability = api.user.checkUsernameAvailable.useQuery(
    { username: debouncedUsername },
    {
      enabled: usernameValid,
      staleTime: 5000,
    },
  );

  const completeMutation = api.user.completeOnboarding.useMutation({
    onSuccess: async () => {
      toast.success('Profile created!');
      await refetchUser();
      router.replace('/dashboard');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to complete onboarding');
    },
  });

  const canAdvance = useMemo(() => {
    if (step === 0) return state.role !== null;
    if (step === 1) {
      return (
        usernameValid &&
        availability.data?.available === true &&
        state.displayName.trim().length >= 1
      );
    }
    if (step === 2) {
      // freelancer-only final step — optional
      return true;
    }
    return false;
  }, [step, state.role, state.displayName, usernameValid, availability.data]);

  const handleNext = () => {
    if (!canAdvance) return;
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step === 0) return;
    setStep((s) => s - 1);
  };

  const handleSubmit = () => {
    if (!state.role) return;
    const hourlyRate = state.hourlyRate ? Number(state.hourlyRate) : undefined;
    completeMutation.mutate({
      role: state.role,
      username: state.username.trim().toLowerCase(),
      displayName: state.displayName.trim(),
      bio: state.bio.trim() || undefined,
      skills: isFreelancer && state.skills.length ? state.skills : undefined,
      hourlyRate: isFreelancer && hourlyRate && hourlyRate > 0 ? hourlyRate : undefined,
      country: state.country.trim() || undefined,
    });
  };

  const addSkill = () => {
    const clean = skillInput.trim();
    if (!clean) return;
    if (state.skills.includes(clean)) return;
    if (state.skills.length >= 20) return;
    setState((s) => ({ ...s, skills: [...s.skills, clean] }));
    setSkillInput('');
  };

  const removeSkill = (skill: string) => {
    setState((s) => ({ ...s, skills: s.skills.filter((x) => x !== skill) }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[560px]"
    >
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/80 p-8 backdrop-blur-xl shadow-2xl shadow-black/30">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
            <span>Step {step + 1} of {totalSteps}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-background-tertiary)]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-accent)]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <StepWrapper key="role">
              <StepHeader
                eyebrow="Step 1"
                title="What brings you to Forj?"
                description="This tunes your dashboard. Either way, your account can hire AND freelance — switch any time."
              />
              <div className="mt-6 grid gap-3">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, role: opt.value }))}
                    className={cn(
                      'group flex items-start gap-4 rounded-[var(--radius-lg)] border p-4 text-left transition-all',
                      state.role === opt.value
                        ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)]'
                        : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-text-primary)]/[0.02]',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-11 items-center justify-center rounded-[var(--radius-md)] transition-colors',
                        state.role === opt.value
                          ? 'bg-gradient-to-br from-[var(--color-brand-primary)]/30 to-[var(--color-brand-secondary)]/30'
                          : 'bg-[var(--color-background-tertiary)]',
                      )}
                    >
                      <opt.icon className="size-5 text-[var(--color-brand-primary)]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                        {opt.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                        {opt.description}
                      </p>
                    </div>
                    {state.role === opt.value ? (
                      <Check className="size-5 text-[var(--color-brand-primary)]" />
                    ) : null}
                  </button>
                ))}
              </div>
            </StepWrapper>
          )}

          {step === 1 && (
            <StepWrapper key="profile">
              <StepHeader
                eyebrow="Step 2"
                title="Claim your identity"
                description="Pick a unique username — it's how people find and trust you."
              />
              <div className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-sm text-[var(--color-text-tertiary)]">
                      forj.work/u/
                    </span>
                    <Input
                      id="username"
                      value={state.username}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          username: e.target.value.toLowerCase().slice(0, 30),
                        }))
                      }
                      placeholder="yourname"
                      className="pl-[132px] pr-10"
                      autoComplete="off"
                    />
                    <UsernameStatus
                      value={state.username}
                      valid={usernameValid}
                      isChecking={availability.isFetching}
                      available={availability.data?.available}
                    />
                  </div>
                  <UsernameHelperText
                    value={state.username}
                    debouncedValue={debouncedUsername}
                    valid={usernameValid}
                    isChecking={availability.isFetching}
                    available={availability.data?.available}
                  />
                </div>

                <div>
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    value={state.displayName}
                    onChange={(e) =>
                      setState((s) => ({ ...s, displayName: e.target.value.slice(0, 80) }))
                    }
                    placeholder="Your public name"
                    className="mt-1.5"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <Label htmlFor="bio">Bio <span className="text-[var(--color-text-tertiary)]">(optional)</span></Label>
                  <Textarea
                    id="bio"
                    value={state.bio}
                    onChange={(e) =>
                      setState((s) => ({ ...s, bio: e.target.value.slice(0, 500) }))
                    }
                    placeholder="Tell people what you do and what you're known for."
                    rows={3}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-right text-xs text-[var(--color-text-tertiary)]">
                    {state.bio.length}/500
                  </p>
                </div>

                <div>
                  <Label htmlFor="country">Country <span className="text-[var(--color-text-tertiary)]">(optional)</span></Label>
                  <Input
                    id="country"
                    value={state.country}
                    onChange={(e) =>
                      setState((s) => ({ ...s, country: e.target.value.slice(0, 80) }))
                    }
                    placeholder="e.g. Indonesia"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </StepWrapper>
          )}

          {step === 2 && isFreelancer && (
            <StepWrapper key="freelancer-extra">
              <StepHeader
                eyebrow="Step 3"
                title="Tell us what you do"
                description="Add skills so clients can find you. Skip if you just want to explore."
              />
              <div className="mt-6 space-y-5">
                <div>
                  <Label htmlFor="skills">Skills</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="skills"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value.slice(0, 40))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="e.g. React"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addSkill}
                      disabled={!skillInput.trim() || state.skills.length >= 20}
                      aria-label="Add skill"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {state.skills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {state.skills.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]"
                        >
                          {s}
                          <button
                            type="button"
                            onClick={() => removeSkill(s)}
                            className="rounded-full p-0.5 hover:bg-white/10"
                            aria-label={`Remove ${s}`}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
                    Up to 20 skills · {state.skills.length}/20
                  </p>
                </div>

                <div>
                  <Label htmlFor="hourlyRate">
                    Hourly rate <span className="text-[var(--color-text-tertiary)]">(USDC, optional)</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-tertiary)]">
                      $
                    </span>
                    <Input
                      id="hourlyRate"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      value={state.hourlyRate}
                      onChange={(e) => setState((s) => ({ ...s, hourlyRate: e.target.value }))}
                      placeholder="50"
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
            </StepWrapper>
          )}
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0 || completeMutation.isPending}
          >
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance || completeMutation.isPending}
            isLoading={completeMutation.isPending}
          >
            {step === totalSteps - 1 ? 'Finish' : 'Continue'}
            {step === totalSteps - 1 ? null : <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function UsernameHelperText({
  value,
  debouncedValue,
  valid,
  isChecking,
  available,
}: {
  value: string;
  debouncedValue: string;
  valid: boolean;
  isChecking: boolean;
  available?: boolean;
}) {
  // Empty field — show the baseline rule.
  if (value.length === 0) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
        3-30 characters: lowercase letters, numbers, <code>_</code> or <code>-</code>.
      </p>
    );
  }
  // Too short.
  if (value.length < 3) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
        Keep going — usernames need at least 3 characters.
      </p>
    );
  }
  // Invalid characters (use debounced so we don't flash while typing).
  if (debouncedValue.length >= 3 && !valid) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-error)]">
        Only lowercase letters, numbers, <code>_</code> and <code>-</code> are allowed.
      </p>
    );
  }
  // Checking against DB.
  if (isChecking) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
        Checking availability…
      </p>
    );
  }
  // Taken.
  if (valid && available === false) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-error)]">
        <span className="font-semibold">@{debouncedValue}</span> is already taken. Try another one.
      </p>
    );
  }
  // Available.
  if (valid && available === true) {
    return (
      <p className="mt-1.5 text-xs text-[var(--color-success)]">
        <span className="font-semibold">@{debouncedValue}</span> is available.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
      3-30 characters: lowercase letters, numbers, <code>_</code> or <code>-</code>.
    </p>
  );
}

function UsernameStatus({
  value,
  valid,
  isChecking,
  available,
}: {
  value: string;
  valid: boolean;
  isChecking: boolean;
  available?: boolean;
}) {
  if (value.length === 0) return null;
  return (
    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
      {isChecking ? (
        <Loader2 className="size-4 animate-spin text-[var(--color-text-tertiary)]" />
      ) : !valid ? (
        <X className="size-4 text-[var(--color-error)]" />
      ) : available ? (
        <Check className="size-4 text-[var(--color-success)]" />
      ) : available === false ? (
        <X className="size-4 text-[var(--color-error)]" />
      ) : null}
    </span>
  );
}
