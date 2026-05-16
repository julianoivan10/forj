'use client';

import { useState } from 'react';
import { Loader2, Plus, X, Hammer } from 'lucide-react';
import { toast } from 'sonner';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Button,
  Input,
  Label,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/**
 * Lazy freelancer escalation modal.
 *
 * The system design (`docs/design/role-and-mode.md` §5) decouples role
 * declaration from role action: any account can post jobs AND apply to
 * jobs. We don't force users to commit "I am a freelancer" at signup —
 * we just collect the freelancer-specific fields (skills, hourly rate)
 * the first time they try to do a freelancer action.
 *
 * Trigger surfaces today:
 *   - "Submit a proposal" on `/jobs/[slug]` — primary use case.
 *   - "Publish a service" on `/dashboard/services/new` — secondary
 *     (form there already collects skills inline, so escalation is a
 *     softer touch; this modal can stand in if we ever streamline it).
 *
 * Usage pattern (parent decides when to gate):
 *
 *   ```tsx
 *   const needsEscalation = !user?.skills?.length || !user?.hourlyRate;
 *   <EscalationModal
 *     open={escalationOpen}
 *     onOpenChange={setEscalationOpen}
 *     onComplete={() => {
 *       setEscalationOpen(false);
 *       setProposalOpen(true); // open the real action now
 *     }}
 *     intent="apply-to-job"
 *   />
 *   ```
 *
 * On submit we:
 *   1. Call `user.updateProfile({ skills, hourlyRate, bio? })`.
 *   2. Call `user.setRole` — promote `'client'` to `'both'` (they were
 *      a client who's now also a freelancer), or set `'freelancer'` if
 *      they had no role yet. Never *downgrade* from `'both'` back to
 *      single-role — that's a separate explicit action via the
 *      mode switcher.
 *   3. Invalidate `user.me` so downstream gates re-evaluate.
 *   4. Fire `onComplete()` so the parent can resume the original flow.
 */

interface EscalationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  /** Tells the user what they just clicked, so the modal copy adapts.
   *  Both intents land in the same form — only the framing changes. */
  intent: 'apply-to-job' | 'publish-service';
}

export function EscalationModal({
  open,
  onOpenChange,
  onComplete,
  intent,
}: EscalationModalProps) {
  const { user } = useAuth();
  const utils = api.useUtils();
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bio, setBio] = useState('');

  const updateProfile = api.user.updateProfile.useMutation();
  const setRole = api.user.setRole.useMutation();

  // Adds the current skill input as a tag. Trim + dedupe + cap at 20
  // (matches the server-side zod schema on `updateProfile.skills`).
  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v) || skills.length >= 20) return;
    setSkills((prev) => [...prev, v]);
    setSkillInput('');
  };
  const removeSkill = (s: string) => setSkills((prev) => prev.filter((x) => x !== s));

  const rate = Number(hourlyRate);
  const canSubmit = skills.length > 0 && rate > 0 && !updateProfile.isPending && !setRole.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await updateProfile.mutateAsync({
        skills,
        hourlyRate: rate,
        bio: bio.trim() || undefined,
      });
      // Promote role thoughtfully:
      //   client → both     (they had hiring intent, now have working intent too)
      //   freelancer → keep (already freelancer)
      //   both → keep       (already both)
      //   null/unset → freelancer (likely a brand-new account routed straight here)
      const currentRole = user?.role ?? null;
      const nextRole =
        currentRole === 'client'
          ? 'both'
          : currentRole === 'freelancer' || currentRole === 'both'
            ? currentRole
            : 'freelancer';
      if (nextRole !== currentRole) {
        await setRole.mutateAsync({ role: nextRole });
      }
      // Force re-read so any gate component sees the new state on the
      // very next render.
      await utils.user.me.invalidate();
      toast.success('Profile saved');
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    }
  };

  const intentCopy = COPY[intent];

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]">
              <Hammer className="size-5" />
            </div>
            <div>
              <ModalTitle>{intentCopy.title}</ModalTitle>
              <ModalDescription className="mt-1">
                {intentCopy.body}
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Skills */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="esc-skills">Skills *</Label>
            <div className="flex gap-2">
              <Input
                id="esc-skills"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="e.g. React, Solidity, Brand identity…"
                maxLength={40}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addSkill}
                disabled={!skillInput.trim() || skills.length >= 20}
                leftIcon={<Plus />}
              >
                Add
              </Button>
            </div>
            {skills.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-2.5 py-1 text-xs text-[var(--color-text-primary)]"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSkill(s)}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Pick 1–20. Clients filter on these.
              </p>
            )}
          </div>

          {/* Hourly rate */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="esc-rate">Hourly rate (USD) *</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-tertiary)]">
                $
              </span>
              <Input
                id="esc-rate"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="50"
                className="pl-7"
              />
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              You can change this anytime in Settings → Profile.
            </p>
          </div>

          {/* Bio (optional) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="esc-bio">
              Short bio <span className="text-[var(--color-text-tertiary)]">(optional)</span>
            </Label>
            <textarea
              id="esc-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="One or two lines clients see on your profile."
              className={cn(
                'rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)]',
                'px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]',
                'focus:border-[var(--color-border-brand)] focus:outline-none',
                'resize-none',
              )}
            />
          </div>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {updateProfile.isPending || setRole.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                intentCopy.cta
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

const COPY: Record<EscalationModalProps['intent'], { title: string; body: string; cta: string }> = {
  'apply-to-job': {
    title: 'Set up your freelancer profile',
    body:
      "Quick step — to apply for jobs, clients need to see your skills and rate. Takes 30 seconds. You'll still be able to hire freelancers too.",
    cta: 'Save & continue',
  },
  'publish-service': {
    title: 'Set up your freelancer profile',
    body:
      "Quick step before publishing — clients see your skills and rate to decide if they're a fit. 30 seconds.",
    cta: 'Save & continue',
  },
};

/**
 * Convenience hook for parents that need to know whether the current
 * user can skip the escalation modal entirely. Returns true if the
 * user already has the bare-minimum freelancer fields (skills + rate).
 */
export function useHasFreelancerProfile(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  const hasSkills = Array.isArray(user.skills) && user.skills.length > 0;
  const hasRate =
    user.hourlyRate != null &&
    Number(user.hourlyRate) > 0;
  return hasSkills && hasRate;
}
