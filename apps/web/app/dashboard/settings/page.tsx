'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Save,
  User,
  Shield,
  Bell,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import {
  Button,
  Input,
  Textarea,
  Label,
  Badge,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui';
import { AvatarUpload } from '@/components/settings/avatar-upload';
import { WalletCard } from '@/components/settings/wallet-card';
import { DepositCard } from '@/components/settings/deposit-card';
import { WithdrawCard } from '@/components/settings/withdraw-card';
import { BADGE_TIER_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────── */
/*  Notification-type metadata for the preferences panel         */
/* ────────────────────────────────────────────────────────────── */
const NOTIFICATION_TYPES = [
  { key: 'proposal_received', label: 'Proposal received', desc: 'When a freelancer applies to your job' },
  { key: 'proposal_accepted', label: 'Proposal accepted', desc: 'When a client accepts your proposal' },
  { key: 'proposal_rejected', label: 'Proposal rejected', desc: 'When a client declines your proposal' },
  { key: 'message_received', label: 'New message', desc: 'When someone sends you a message' },
  { key: 'contract_funded', label: 'Contract funded', desc: 'When escrow is funded for your contract' },
  { key: 'contract_submitted', label: 'Work submitted', desc: 'When a freelancer submits deliverables' },
  { key: 'contract_completed', label: 'Contract completed', desc: 'When a contract is marked complete' },
  { key: 'contract_disputed', label: 'Contract disputed', desc: 'When a dispute is raised' },
  { key: 'review_received', label: 'Review received', desc: 'When someone leaves you a review' },
  { key: 'system', label: 'System', desc: 'Platform updates and announcements' },
] as const;

export default function DashboardSettingsPage() {
  const { user, refetchUser } = useAuth();
  const [tab, setTab] = useState<'profile' | 'account' | 'notifications'>('profile');

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
        Settings
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Manage your profile, account, and preferences.
      </p>

      {/* Tab bar */}
      <div className="mt-6 flex gap-1 border-b border-[var(--color-border-default)]">
        {([
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'account', label: 'Account', icon: Shield },
          { key: 'notifications', label: 'Notifications', icon: Bell },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab user={user} onSave={refetchUser} />}
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'notifications' && <NotificationsTab user={user} onSave={refetchUser} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE TAB
   ═══════════════════════════════════════════════════════════════ */
function ProfileTab({ user, onSave }: { user: NonNullable<ReturnType<typeof useAuth>['user']>; onSave: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [hourlyRate, setHourlyRate] = useState(user.hourlyRate ?? '');
  const [country, setCountry] = useState(user.country ?? '');

  const updateMut = api.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success('Profile updated');
      onSave();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMut.mutate({
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
      country: country.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Avatar uploader + identity */}
      <div className="flex flex-col gap-5 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <AvatarUpload
          name={user.displayName ?? user.username ?? 'You'}
          currentUrl={user.avatarUrl}
          onUploaded={onSave}
        />
        <div className="text-left sm:text-right">
          <p className="font-display text-lg font-bold text-[var(--color-text-primary)]">
            {user.displayName ?? user.username}
          </p>
          {user.username && (
            <p className="text-sm text-[var(--color-text-tertiary)]">@{user.username}</p>
          )}
          <Badge variant="brand" className="mt-1.5 capitalize">
            {user.role === 'both' ? 'Freelancer & Client' : user.role}
          </Badge>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 80))} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} rows={3} className="mt-1.5" />
          <p className="mt-1 text-right text-xs text-[var(--color-text-tertiary)]">{bio.length}/500</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="hourlyRate">Hourly rate (USDC)</Label>
            <Input id="hourlyRate" type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="mt-1.5" placeholder="50" />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={country} onChange={(e) => setCountry(e.target.value.slice(0, 80))} className="mt-1.5" placeholder="e.g. Indonesia" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} isLoading={updateMut.isPending} leftIcon={<Save />}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNT TAB — wallet, details, data export, delete account
   ═══════════════════════════════════════════════════════════════ */
function AccountTab({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const tierMeta = BADGE_TIER_META[user.badgeTier as keyof typeof BADGE_TIER_META] ?? BADGE_TIER_META.none;

  return (
    <div className="space-y-6">
      <WalletCard dbWallet={user.walletAddress ?? null} />
      <DepositCard />
      <WithdrawCard />

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          Account details
        </h3>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Email" value={user.email ?? 'Not set'} />
          <Row label="Username" value={user.username ? `@${user.username}` : 'Not set'} />
          <Row
            label="Badge tier"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: tierMeta.color }} />
                {tierMeta.label}
              </span>
            }
          />
          <Row label="WorkScore" value={Number(user.workScore ?? 0).toFixed(0)} />
          <Row label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
        </dl>
      </div>

      {/* Data Export */}
      <DataExportCard />

      {/* Delete Account */}
      <DeleteAccountCard username={user.username ?? ''} />
    </div>
  );
}

/* ── Data Export Card ──────────────────────────────────────────── */
function DataExportCard() {
  const exportQuery = api.user.exportData.useQuery(undefined, { enabled: false });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `forj-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Data exported successfully');
      }
    } catch {
      toast.error('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
        Your data
      </h3>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        Download a JSON file of all data Forj stores about you — profile, jobs, proposals,
        contracts, reviews, and messages.
      </p>
      <div className="mt-4">
        <Button variant="secondary" onClick={handleExport} isLoading={isExporting} leftIcon={<Download />}>
          Export my data
        </Button>
      </div>
    </div>
  );
}

/* ── Delete Account Card ──────────────────────────────────────── */
function DeleteAccountCard({ username }: { username: string }) {
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
              Danger zone
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Permanently delete your account. Your profile data will be anonymised, but on-chain
              contract history and reviews will remain for transparency.
            </p>
            <div className="mt-4">
              <Button variant="destructive" onClick={() => setOpen(true)} leftIcon={<Trash2 />}>
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
              This action cannot be undone. Your profile data (email, bio, avatar) will be anonymised.
              On-chain contract history and reviews will remain public. If you have any active contracts,
              you must complete or cancel them first.
            </ModalDescription>
          </ModalHeader>
          <div className="px-6 pb-2">
            <Label htmlFor="confirmDelete">
              Type <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-[var(--color-error)]">{username}</code> to confirm
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
            <Button variant="ghost" onClick={() => { setOpen(false); setConfirm(''); }}>
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

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS TAB — per-type in-app + email preferences
   ═══════════════════════════════════════════════════════════════ */
function NotificationsTab({ user, onSave }: { user: NonNullable<ReturnType<typeof useAuth>['user']>; onSave: () => void }) {
  const existingPrefs = (user.notificationPreferences ?? {}) as {
    inApp?: Partial<Record<string, boolean>>;
    email?: Partial<Record<string, boolean>>;
  };

  const [inApp, setInApp] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const t of NOTIFICATION_TYPES) {
      out[t.key] = existingPrefs.inApp?.[t.key] !== false; // default ON
    }
    return out;
  });

  const [email, setEmail] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const t of NOTIFICATION_TYPES) {
      out[t.key] = existingPrefs.email?.[t.key] !== false; // default ON
    }
    return out;
  });

  const updateMut = api.user.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success('Notification preferences saved');
      onSave();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    // Only save keys that are explicitly set to false (opt-out).
    // Keys not present = default (on).
    const inAppPatch: Record<string, boolean> = {};
    const emailPatch: Record<string, boolean> = {};
    for (const t of NOTIFICATION_TYPES) {
      if (!inApp[t.key]) inAppPatch[t.key] = false;
      if (!email[t.key]) emailPatch[t.key] = false;
    }
    updateMut.mutate({ inApp: inAppPatch, email: emailPatch });
  };

  const toggleAll = (channel: 'inApp' | 'email', enabled: boolean) => {
    const setter = channel === 'inApp' ? setInApp : setEmail;
    setter((prev) => {
      const next = { ...prev };
      for (const t of NOTIFICATION_TYPES) {
        next[t.key] = enabled;
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              Notification channels
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Choose which notifications you want to receive and how.
            </p>
          </div>
        </div>

        {/* Column headers */}
        <div className="mt-6 flex items-center gap-3 border-b border-[var(--color-border-default)] pb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
          <span className="flex-1">Event</span>
          <button
            type="button"
            className="w-16 text-center hover:text-[var(--color-text-secondary)] transition-colors"
            onClick={() => {
              const allOn = Object.values(inApp).every(Boolean);
              toggleAll('inApp', !allOn);
            }}
          >
            In-app
          </button>
          <button
            type="button"
            className="w-16 text-center hover:text-[var(--color-text-secondary)] transition-colors"
            onClick={() => {
              const allOn = Object.values(email).every(Boolean);
              toggleAll('email', !allOn);
            }}
          >
            Email
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {NOTIFICATION_TYPES.map((t) => (
            <div key={t.key} className="flex items-center gap-3 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{t.label}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{t.desc}</p>
              </div>
              <div className="flex w-16 justify-center">
                <ToggleSwitch checked={inApp[t.key] ?? true} onChange={(v) => setInApp((p) => ({ ...p, [t.key]: v }))} />
              </div>
              <div className="flex w-16 justify-center">
                <ToggleSwitch checked={email[t.key] ?? true} onChange={(v) => setEmail((p) => ({ ...p, [t.key]: v }))} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleSave} isLoading={updateMut.isPending} leftIcon={<Save />}>
            Save preferences
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared helpers ────────────────────────────────────────────── */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked
          ? 'bg-[var(--color-brand-primary)]'
          : 'bg-[var(--color-background-tertiary)] border border-[var(--color-border-default)]',
      )}
    >
      <span
        className={cn(
          'inline-block size-3.5 rounded-full bg-white transition-transform shadow-sm',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className={cn('text-right text-[var(--color-text-primary)]', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}
