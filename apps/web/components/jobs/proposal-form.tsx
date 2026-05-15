'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ListChecks, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn, formatUSD } from '@/lib/utils';

/**
 * Per-milestone shape on the proposal form. We keep amount as a string
 * (not a number) while the user is typing — easier to handle "" vs "0"
 * vs partial decimals. Coerced to Number on submit.
 */
interface MilestoneDraft {
  title: string;
  amount: string;
  duration: string;
  description: string;
}

const MAX_MILESTONES = 10;

function emptyMilestone(): MilestoneDraft {
  return { title: '', amount: '', duration: '', description: '' };
}

interface ProposalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
  jobBudgetType: 'fixed' | 'hourly';
  jobBudgetMin: string;
  jobBudgetMax: string;
  onSuccess?: () => void;
}

export function ProposalForm({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  jobBudgetType,
  jobBudgetMin,
  jobBudgetMax,
  onSuccess,
}: ProposalFormProps) {
  const [coverLetter, setCoverLetter] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Milestone state. Hidden behind a toggle so simple proposals stay
  // a single bid; turning it on switches into a "split into milestones"
  // mode where the bid is partitioned across stages with their own
  // approval gates.
  const [splitIntoMilestones, setSplitIntoMilestones] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() => [
    emptyMilestone(),
    emptyMilestone(),
  ]);
  const milestoneSum = useMemo(
    () =>
      milestones.reduce((acc, m) => {
        const n = Number(m.amount);
        return acc + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0),
    [milestones],
  );
  const bidNum = Number(bidAmount);
  const milestoneSumMatchesBid =
    Number.isFinite(bidNum) && bidNum > 0 && Math.abs(milestoneSum - bidNum) < 0.01;

  const router = useRouter();
  const utils = api.useUtils();
  const submit = api.proposal.create.useMutation({
    onSuccess: () => {
      utils.proposal.myProposals.invalidate();
      // Order matters: fire the navigation FIRST so it lands in Next's
      // router queue before we trigger Radix Dialog's close animation.
      // If we close the modal first, the parent re-renders, and on
      // some browsers the subsequent `router.push` no-ops because the
      // pending state was wiped during the unmount cycle. Several users
      // reported "submitted but stayed on the job page" — this fixes it.
      toast.success('Proposal submitted!', {
        description: 'The client has been notified. Track it in your dashboard.',
      });
      router.push('/dashboard/proposals');
      // Reset form values + close modal AFTER navigation queue is set.
      setCoverLetter('');
      setBidAmount('');
      setEstimatedDuration('');
      setError(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const bid = Number(bidAmount);
    if (!Number.isFinite(bid) || bid <= 0) {
      setError('Bid amount must be a positive number.');
      return;
    }
    if (coverLetter.trim().length < 50) {
      setError('Cover letter must be at least 50 characters.');
      return;
    }
    if (!estimatedDuration.trim()) {
      setError('Please describe the estimated duration.');
      return;
    }

    // Milestone validation — only when the freelancer opted in. We
    // require at least 1 entry, sum to match the bid, and each row
    // to have a title + positive amount. Description + duration are
    // optional per row but encouraged.
    let milestonesPayload: { title: string; amount: number; duration: string; description: string }[] | undefined;
    if (splitIntoMilestones) {
      if (milestones.length === 0) {
        setError('Add at least one milestone, or turn off milestone split.');
        return;
      }
      const cleaned: typeof milestonesPayload = [];
      for (let i = 0; i < milestones.length; i += 1) {
        const m = milestones[i]!;
        const amt = Number(m.amount);
        if (!m.title.trim()) {
          setError(`Milestone ${i + 1}: add a title.`);
          return;
        }
        if (!Number.isFinite(amt) || amt <= 0) {
          setError(`Milestone ${i + 1}: amount must be a positive number.`);
          return;
        }
        cleaned.push({
          title: m.title.trim(),
          amount: amt,
          duration: m.duration.trim() || 'tbd',
          description: m.description.trim(),
        });
      }
      const sum = cleaned.reduce((a, m) => a + m.amount, 0);
      if (Math.abs(sum - bid) > 0.01) {
        setError(
          `Milestone amounts (${formatUSD(sum)}) must total your bid (${formatUSD(bid)}).`,
        );
        return;
      }
      milestonesPayload = cleaned;
    }

    submit.mutate({
      jobId,
      coverLetter: coverLetter.trim(),
      bidAmount: bid,
      bidType: jobBudgetType,
      estimatedDuration: estimatedDuration.trim(),
      milestones: milestonesPayload,
    });
  };

  const updateMilestone = (idx: number, patch: Partial<MilestoneDraft>) => {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const addMilestone = () => {
    setMilestones((prev) =>
      prev.length < MAX_MILESTONES ? [...prev, emptyMilestone()] : prev,
    );
  };
  const removeMilestone = (idx: number) => {
    setMilestones((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };
  const distributeRemainder = () => {
    // Helper UX: split bid evenly across all milestones. Saves the user
    // from doing arithmetic when they just want "this big project, 4
    // equal phases".
    if (!Number.isFinite(bidNum) || bidNum <= 0) return;
    if (milestones.length === 0) return;
    const each = Math.round((bidNum / milestones.length) * 100) / 100;
    // Round-off: assign exact `bid - (n-1)*each` to the last so the sum
    // ties out to the bid exactly even with floating-point cents.
    const last = Math.round((bidNum - each * (milestones.length - 1)) * 100) / 100;
    setMilestones((prev) =>
      prev.map((m, i) => ({
        ...m,
        amount: (i === prev.length - 1 ? last : each).toString(),
      })),
    );
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Submit a proposal</ModalTitle>
          <ModalDescription>
            Applying to <span className="text-[var(--color-text-primary)]">{jobTitle}</span>. The client&apos;s range is {formatUSD(jobBudgetMin)} – {formatUSD(jobBudgetMax)} {jobBudgetType === 'hourly' ? '/hr' : 'fixed'}.
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bid-amount">
              Your bid ({jobBudgetType === 'hourly' ? 'USDC / hour' : 'USDC total'})
            </Label>
            <Input
              id="bid-amount"
              inputMode="decimal"
              placeholder="e.g. 1500"
              leftIcon={<span className="text-sm">$</span>}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration">Estimated duration</Label>
            <Input
              id="duration"
              placeholder="e.g. 2 weeks, 40 hours, 1 month"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
            />
          </div>

          {/* Milestones toggle + editor */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={splitIntoMilestones}
                onChange={(e) => setSplitIntoMilestones(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--color-brand-primary)]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-[var(--color-brand-primary)]" />
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Split into milestones
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  For larger projects, break the work into stages. The client approves
                  each stage as you ship — your reputation builds milestone by milestone
                  instead of waiting for one big release at the end.
                </p>
              </div>
            </label>

            {splitIntoMilestones ? (
              <div className="mt-4 flex flex-col gap-3">
                {milestones.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-secondary)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-glow-brand)] text-xs font-bold text-[var(--color-brand-primary)]">
                        {i + 1}
                      </span>
                      <Input
                        value={m.title}
                        onChange={(e) => updateMilestone(i, { title: e.target.value })}
                        placeholder={`Milestone ${i + 1} title (e.g. "Wireframes & user flow")`}
                        className="flex-1"
                      />
                      {milestones.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeMilestone(i)}
                          className="rounded p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                          aria-label="Remove milestone"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Input
                        inputMode="decimal"
                        leftIcon={<span className="text-sm">$</span>}
                        placeholder="Amount"
                        value={m.amount}
                        onChange={(e) =>
                          updateMilestone(i, {
                            amount: e.target.value.replace(/[^0-9.]/g, ''),
                          })
                        }
                      />
                      <Input
                        placeholder="Duration (e.g. 1 week)"
                        value={m.duration}
                        onChange={(e) => updateMilestone(i, { duration: e.target.value })}
                      />
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Deliverables for this stage (optional)"
                      value={m.description}
                      onChange={(e) => updateMilestone(i, { description: e.target.value })}
                      className="mt-2 resize-none text-sm"
                    />
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addMilestone}
                    disabled={milestones.length >= MAX_MILESTONES}
                    leftIcon={<Plus />}
                  >
                    Add milestone
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={distributeRemainder}
                    disabled={!Number.isFinite(bidNum) || bidNum <= 0}
                  >
                    Split bid evenly
                  </Button>
                  <span
                    className={cn(
                      'ml-auto text-xs font-medium tabular-nums',
                      milestoneSumMatchesBid
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-warning)]',
                    )}
                  >
                    {formatUSD(milestoneSum)}
                    {Number.isFinite(bidNum) && bidNum > 0
                      ? ` / ${formatUSD(bidNum)}`
                      : ''}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cover">Cover letter</Label>
            <Textarea
              id="cover"
              rows={7}
              placeholder="Introduce yourself, explain why you're a fit, and outline your approach. Minimum 50 characters."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
            />
            <span className="self-end text-xs text-[var(--color-text-tertiary)]">
              {coverLetter.length} / 5000
            </span>
          </div>

          {error ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
              {error}
            </p>
          ) : null}

          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={submit.isPending}
              leftIcon={submit.isPending ? <Loader2 /> : <Send />}
            >
              Send proposal
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
