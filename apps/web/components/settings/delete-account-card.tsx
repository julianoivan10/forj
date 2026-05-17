'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
} from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';

/**
 * Danger-zone card: permanently delete the user's account.
 *
 * Lives in the Security tab (where destructive actions belong) rather
 * than Account. Soft-delete only — see `user.deleteAccount` for the
 * server-side anonymisation. Confirmation gate requires typing the
 * exact username; protects against muscle-memory clicks.
 *
 * Behaviour:
 *   - Refuses if there are active contracts (server enforces; we
 *     surface the error toast).
 *   - On success: logs the user out + redirects to the marketing
 *     home so they don't bounce back into a stale authed shell.
 */
export function DeleteAccountCard({ username }: { username: string }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');

  const deleteMut = api.user.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success('Account deleted');
      await logout();
      router.replace('/');
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-error)]" />
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--color-error)]">
              Delete account
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Permanently delete your account. Your profile data will be
              anonymised, but on-chain contract history and reviews will
              remain for transparency. Active contracts must be completed
              or cancelled first.
            </p>
            <div className="mt-4">
              <Button
                variant="destructive"
                onClick={() => setOpen(true)}
                leftIcon={<Trash2 />}
              >
                Delete my account
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete your account?</ModalTitle>
            <ModalDescription>
              This action cannot be undone. Your profile data (email, bio,
              avatar) will be anonymised. On-chain contract history and
              reviews will remain public. If you have any active contracts,
              you must complete or cancel them first.
            </ModalDescription>
          </ModalHeader>
          <div className="px-6 pb-2">
            <Label htmlFor="confirmDelete">
              Type{' '}
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-[var(--color-error)]">
                {username}
              </code>{' '}
              to confirm
            </Label>
            <Input
              id="confirmDelete"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={username}
              className="mt-1.5"
              autoComplete="off"
            />
          </div>
          <ModalFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setConfirm('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirm !== username}
              isLoading={deleteMut.isPending}
              onClick={() => deleteMut.mutate({ confirmUsername: confirm })}
            >
              Delete permanently
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
