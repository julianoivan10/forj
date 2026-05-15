'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  ListChecks,
  PlayCircle,
  Send,
  Upload,
} from 'lucide-react';
import {
  Badge,
  Button,
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
 * Milestone progress tracker shown on the contract detail page.
 *
 * Phase 7A scope: off-chain progress tracking only. The on-chain escrow
 * still funds + releases the FULL amount in single shot — these milestone
 * status flips are purely visual signals + per-milestone notifications so
 * the client and freelancer can co-ordinate big projects in chunks
 * without the on-chain complexity.
 *
 * Phase 7B (later) will swap the off-chain `approve` for a real per-
 * milestone on-chain release. Same UI shape; we just point the approve
 * action at a different mutation.
 */

interface MilestoneShape {
  title: string;
  amount: number;
  duration: string;
  description: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved';
}

export function MilestoneTracker({
  contractId,
  milestones,
  isClient,
  isFreelancer,
  onChanged,
}: {
  contractId: string;
  milestones: MilestoneShape[];
  isClient: boolean;
  isFreelancer: boolean;
  onChanged?: () => void;
}) {
  const utils = api.useUtils();
  const [submitOpen, setSubmitOpen] = useState<number | null>(null);
  const [submitMessage, setSubmitMessage] = useState('');

  const submitMut = api.contract.markMilestoneSubmitted.useMutation({
    onSuccess: () => {
      toast.success('Milestone submitted — waiting on client approval');
      setSubmitOpen(null);
      setSubmitMessage('');
      utils.contract.getById.invalidate({ id: contractId });
      onChanged?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMut = api.contract.approveMilestoneOffchain.useMutation({
    onSuccess: () => {
      toast.success('Milestone approved');
      utils.contract.getById.invalidate({ id: contractId });
      onChanged?.();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!milestones.length) return null;

  const totalAmount = milestones.reduce((sum, m) => sum + Number(m.amount ?? 0), 0);
  const approvedAmount = milestones
    .filter((m) => m.status === 'approved')
    .reduce((sum, m) => sum + Number(m.amount ?? 0), 0);
  const progressPct =
    totalAmount > 0 ? Math.round((approvedAmount / totalAmount) * 100) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
    >
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-[var(--color-brand-primary)]" />
        <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          Milestones
        </h2>
        <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
          {progressPct}% complete · {formatUSD(approvedAmount)} of {formatUSD(totalAmount)}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Track work in chunks. Funds release in full at the end — milestones are
        the agreed plan and proof-of-progress.
      </p>

      {/* Progress bar */}
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--color-background-tertiary)]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-accent)]"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Milestone rows */}
      <ol className="mt-5 space-y-3">
        {milestones.map((m, i) => (
          <MilestoneRow
            key={i}
            index={i}
            milestone={m}
            isClient={isClient}
            isFreelancer={isFreelancer}
            isSubmitting={submitMut.isPending && submitOpen === i}
            isApproving={approveMut.isPending}
            onSubmitClick={() => {
              setSubmitMessage('');
              setSubmitOpen(i);
            }}
            onApproveClick={() =>
              approveMut.mutate({ contractId, milestoneIndex: i })
            }
          />
        ))}
      </ol>

      {/* Submit modal */}
      <Modal open={submitOpen != null} onOpenChange={(o) => !o && setSubmitOpen(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>
              Submit milestone{' '}
              {submitOpen != null ? `#${submitOpen + 1} — ${milestones[submitOpen]?.title}` : ''}
            </ModalTitle>
            <ModalDescription>
              Tell the client what you delivered and what's next. They'll get a
              notification with this note.
            </ModalDescription>
          </ModalHeader>
          <Textarea
            value={submitMessage}
            onChange={(e) => setSubmitMessage(e.target.value)}
            rows={5}
            placeholder="Summary of what's done, links to deliverables, anything that needs the client's attention…"
            className="resize-none"
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(null)}>
              Cancel
            </Button>
            <Button
              leftIcon={<Send />}
              isLoading={submitMut.isPending}
              disabled={submitMessage.trim().length < 10}
              onClick={() => {
                if (submitOpen == null) return;
                submitMut.mutate({
                  contractId,
                  milestoneIndex: submitOpen,
                  message: submitMessage.trim(),
                });
              }}
            >
              Submit milestone
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.section>
  );
}

function MilestoneRow({
  index,
  milestone,
  isClient,
  isFreelancer,
  isSubmitting,
  isApproving,
  onSubmitClick,
  onApproveClick,
}: {
  index: number;
  milestone: MilestoneShape;
  isClient: boolean;
  isFreelancer: boolean;
  isSubmitting: boolean;
  isApproving: boolean;
  onSubmitClick: () => void;
  onApproveClick: () => void;
}) {
  const meta = STATUS_META[milestone.status];
  const Icon = meta.icon;
  const canSubmit =
    isFreelancer && (milestone.status === 'in_progress' || milestone.status === 'pending');
  const canApprove = isClient && milestone.status === 'submitted';

  return (
    <li
      className={cn(
        'flex items-start gap-4 rounded-[var(--radius-md)] border bg-[var(--color-background-tertiary)]/40 p-4 transition-colors',
        meta.borderClass,
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border',
          meta.iconClass,
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
            {index + 1}. {milestone.title}
          </span>
          <Badge variant={meta.badge}>{meta.label}</Badge>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            · {milestone.duration} · {formatUSD(milestone.amount)}
          </span>
        </div>
        {milestone.description ? (
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {milestone.description}
          </p>
        ) : null}
      </div>
      {canSubmit ? (
        <Button
          size="sm"
          leftIcon={<Upload />}
          isLoading={isSubmitting}
          onClick={onSubmitClick}
        >
          Submit
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Check />}
          isLoading={isApproving}
          onClick={onApproveClick}
        >
          Approve
        </Button>
      ) : null}
    </li>
  );
}

const STATUS_META: Record<
  MilestoneShape['status'],
  {
    label: string;
    badge: 'success' | 'warning' | 'default' | 'brand';
    icon: React.ComponentType<{ className?: string }>;
    borderClass: string;
    iconClass: string;
  }
> = {
  pending: {
    label: 'Pending',
    badge: 'default',
    icon: CircleDashed,
    borderClass: 'border-[var(--color-border-subtle)]',
    iconClass:
      'border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] text-[var(--color-text-tertiary)]',
  },
  in_progress: {
    label: 'In progress',
    badge: 'brand',
    icon: PlayCircle,
    borderClass: 'border-[var(--color-border-brand)]',
    iconClass:
      'border-[var(--color-brand-primary)]/40 bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]',
  },
  submitted: {
    label: 'Awaiting review',
    badge: 'warning',
    icon: Clock,
    borderClass: 'border-[var(--color-warning)]/30',
    iconClass:
      'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  },
  approved: {
    label: 'Approved',
    badge: 'success',
    icon: CheckCircle2,
    borderClass: 'border-[var(--color-success)]/30',
    iconClass:
      'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]',
  },
};
