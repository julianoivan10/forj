'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, KeyRound, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button, Input, Label, Textarea } from '@/components/ui';
import { api } from '@/lib/trpc/client';

/**
 * Admin → User recovery. Wraps `admin.relinkUser` and
 * `admin.restoreUser` in forms that match the OPERATIONS.md §8
 * runbook.
 *
 * Why two separate forms (not one with a kind picker):
 *   The two actions have meaningfully different inputs (relink needs
 *   `newPrivyId`, restore parses it from the tombstone) AND different
 *   pre-conditions (relink requires target NOT deleted, restore
 *   requires target deleted). Keeping them visually separate
 *   prevents the admin from picking the wrong action and getting a
 *   confusing error.
 *
 * Both forms re-render the audit log preview after a successful
 * submission so the admin gets visual confirmation that their action
 * was logged.
 */
export default function AdminUsersPage() {
  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          User recovery
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Manual recovery procedures for users who&apos;ve lost access OR
          regret deletion. Every action is logged with a written reason
          you must provide — there&apos;s no quick path here, that&apos;s
          intentional.
        </p>
      </header>

      {/* Proof bar reminder — every visit to this page should
          re-state the rule. Repetition prevents the "just this once"
          drift over time. */}
      <aside className="mt-6 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-4">
        <ShieldAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]"
        />
        <div className="text-sm text-[var(--color-text-secondary)]">
          <p className="font-medium text-[var(--color-text-primary)]">
            Proof of identity required.
          </p>
          <p className="mt-1">
            Accept ONLY if one of: (a) signed message from a previously
            linked wallet, (b) old Forj email cross-checked in Resend
            logs + secondary factor, (c) government ID + selfie
            matching profile photo. See{' '}
            <a
              href="/docs/OPERATIONS.md#8-emergency-account-recovery"
              className="inline-flex items-center gap-0.5 text-[var(--color-brand-primary)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              OPERATIONS §8
              <ExternalLink className="size-3" />
            </a>{' '}
            for the full bar.
          </p>
        </div>
      </aside>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <RelinkUserCard />
        <RestoreUserCard />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
function RelinkUserCard() {
  const utils = api.useUtils();
  const [targetUserId, setTargetUserId] = useState('');
  const [newPrivyId, setNewPrivyId] = useState('');
  const [reason, setReason] = useState('');

  const mut = api.admin.relinkUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Relinked. New privyId: ${data.newPrivyId.slice(0, 32)}…`);
      setTargetUserId('');
      setNewPrivyId('');
      setReason('');
      utils.admin.listAuditLog.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    targetUserId.trim().length === 36 &&
    newPrivyId.trim().length >= 8 &&
    reason.trim().length >= 20 &&
    !mut.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        mut.mutate({
          targetUserId: targetUserId.trim(),
          newPrivyId: newPrivyId.trim(),
          reason: reason.trim(),
        });
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
    >
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]">
          <KeyRound className="size-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Re-link account
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Bind a new privyId onto an existing (non-deleted) user row.
            Use when automatic wallet-match recovery failed.
          </p>
        </div>
      </header>

      <div>
        <Label htmlFor="relink-target">Target user ID (UUID)</Label>
        <Input
          id="relink-target"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="e.g. b77d97d2-9026-4fbb-bb7d-fea2b145b9c3"
          className="mt-1.5 font-mono text-xs"
          autoComplete="off"
        />
      </div>

      <div>
        <Label htmlFor="relink-privy">New Privy user id</Label>
        <Input
          id="relink-privy"
          value={newPrivyId}
          onChange={(e) => setNewPrivyId(e.target.value)}
          placeholder="did:privy:cmovg34pq003b0cjsyxav4awj"
          className="mt-1.5 font-mono text-xs"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Copy from the ghost row the user created after signing up
          fresh. Will be unique-checked server-side.
        </p>
      </div>

      <ReasonField id="relink-reason" value={reason} onChange={setReason} />

      <Button type="submit" disabled={!canSubmit} isLoading={mut.isPending}>
        Re-link account
      </Button>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────── */
function RestoreUserCard() {
  const utils = api.useUtils();
  const [targetUserId, setTargetUserId] = useState('');
  const [newPrivyId, setNewPrivyId] = useState('');
  const [reason, setReason] = useState('');

  const mut = api.admin.restoreUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Restored. PII not recovered — user re-enters on login.`);
      setTargetUserId('');
      setNewPrivyId('');
      setReason('');
      utils.admin.listAuditLog.invalidate();
      // Display the piiNote in console for support agents — they may
      // want to copy/paste it into the ticket.
      // eslint-disable-next-line no-console
      console.info('[restoreUser]', data);
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit =
    targetUserId.trim().length === 36 &&
    reason.trim().length >= 20 &&
    !mut.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        mut.mutate({
          targetUserId: targetUserId.trim(),
          newPrivyId: newPrivyId.trim() || undefined,
          reason: reason.trim(),
        });
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
    >
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]">
          <RotateCcw className="size-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Restore soft-deleted account
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Undo a soft-delete. Original privyId is parsed from the
            tombstone unless overridden. PII is NOT recoverable — user
            re-enters on login.
          </p>
        </div>
      </header>

      <div>
        <Label htmlFor="restore-target">Target user ID (UUID)</Label>
        <Input
          id="restore-target"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="e.g. b77d97d2-9026-4fbb-bb7d-fea2b145b9c3"
          className="mt-1.5 font-mono text-xs"
          autoComplete="off"
        />
      </div>

      <div>
        <Label htmlFor="restore-privy">
          New Privy user id{' '}
          <span className="font-normal text-[var(--color-text-tertiary)]">
            (optional override)
          </span>
        </Label>
        <Input
          id="restore-privy"
          value={newPrivyId}
          onChange={(e) => setNewPrivyId(e.target.value)}
          placeholder="Leave blank to parse from tombstone"
          className="mt-1.5 font-mono text-xs"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Only set if the tombstone format is broken OR the user has a
          fresh Privy session you want to bind instead.
        </p>
      </div>

      <ReasonField id="restore-reason" value={reason} onChange={setReason} />

      <Button type="submit" disabled={!canSubmit} isLoading={mut.isPending}>
        Restore account
      </Button>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────── */
/** Shared reason field. Enforces the 20-char minimum that matches the
 *  server-side zod schema, with a live char counter so the admin
 *  knows when they've cleared the threshold. */
function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const remaining = Math.max(0, 20 - value.trim().length);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>Reason (required, ≥ 20 chars)</Label>
        <span
          className={
            remaining > 0
              ? 'text-[10px] text-[var(--color-warning)]'
              : 'text-[10px] text-[var(--color-text-tertiary)]'
          }
        >
          {remaining > 0 ? `${remaining} more needed` : `${value.length} chars`}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="e.g. On-chain signature from 0xabc...123 matching contract 0xdef. Verified at https://etherscan.io/... Support ticket #1234."
        className="mt-1.5"
      />
      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
        Capture the proof source verbatim. This is the audit log entry —
        future you will read it during forensics.
      </p>
    </div>
  );
}
