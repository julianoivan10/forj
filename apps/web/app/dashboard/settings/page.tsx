'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Lock,
  Plus,
  X,
  Link as LinkIcon,
  Globe,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { SecurityTab } from '@/components/settings/security-tab';
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
  const searchParams = useSearchParams();
  // Initial tab: respect `?tab=<slug>` so deep links (e.g. the
  // dashboard recovery nudge → /dashboard/settings?tab=security)
  // land on the right pane. Falls back to Profile.
  const initialTab = (() => {
    const t = searchParams.get('tab');
    if (t === 'account' || t === 'security' || t === 'notifications') return t;
    return 'profile' as const;
  })();
  const [tab, setTab] = useState<'profile' | 'account' | 'security' | 'notifications'>(initialTab);

  // If the URL `?tab=` changes after mount (back/forward nav), sync
  // — but don't fight the user clicking tab buttons (those don't
  // mutate the URL). Effect dependency is just the searchParams
  // string, not `tab` state.
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'profile' || t === 'account' || t === 'security' || t === 'notifications') {
      setTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
        Settings
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Manage your profile, account, and preferences.
      </p>

      {/* Tab bar — horizontally scrollable on mobile so the three tabs
          don't bleed off the right edge of a 375px viewport. The
          `scrollbar-thin` would be nice but Tailwind 4 doesn't ship it
          by default; the native scrollbar fades in only when needed. */}
      <div className="mt-6 -mx-4 overflow-x-auto border-b border-[var(--color-border-default)] sm:mx-0">
        <div className="flex w-max min-w-full gap-1 px-4 sm:px-0">
          {([
            { key: 'profile', label: 'Profile', icon: User },
            { key: 'account', label: 'Account', icon: Shield },
            { key: 'security', label: 'Security', icon: Lock },
            { key: 'notifications', label: 'Notifications', icon: Bell },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
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
      </div>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab user={user} onSave={refetchUser} />}
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'notifications' && <NotificationsTab user={user} onSave={refetchUser} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE TAB
   ═══════════════════════════════════════════════════════════════ */
function ProfileTab({
  user,
  onSave,
}: {
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
  onSave: () => void;
}) {
  // Core identity
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  // Freelancer fields — hourly rate + skills + portfolio. Shown to
  // everyone (clients who never escalated have these empty, no harm)
  // since the same form is used post-lazy-escalation.
  const [hourlyRate, setHourlyRate] = useState(user.hourlyRate ?? '');
  const [skills, setSkills] = useState<string[]>(user.skills ?? []);
  const [skillInput, setSkillInput] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState(user.portfolioIpfsHash ?? '');
  // Location
  const [country, setCountry] = useState(user.country ?? '');
  const [timezone, setTimezone] = useState(user.timezone ?? '');

  const updateMut = api.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success('Profile updated');
      onSave();
    },
    onError: (err) => toast.error(err.message),
  });

  // Inline validation. Compute per-field error messages from the
  // current input state so they reflect what the user just typed,
  // not what was last submitted. Empty / unset → no error (those are
  // valid; only invalid content errors). Save is disabled until all
  // errors clear so the user never round-trips a server zod failure.
  const hourlyRateError = (() => {
    if (hourlyRate === '' || hourlyRate == null) return null;
    const n = Number(hourlyRate);
    if (!Number.isFinite(n)) return 'Hourly rate must be a number.';
    if (n <= 0) return 'Hourly rate must be greater than 0.';
    if (n > 9999) return 'That seems unusually high — please double-check.';
    return null;
  })();
  const portfolioError = (() => {
    const v = portfolioUrl.trim();
    if (!v) return null;
    if (v.length > 500) return 'Portfolio URL is too long (max 500 chars).';
    if (!/^https?:\/\//.test(v)) {
      return 'Must start with http:// or https://.';
    }
    try {
      new URL(v);
      return null;
    } catch {
      return 'That doesn\'t look like a valid URL.';
    }
  })();
  const bioError = bio.length > 500 ? 'Bio is over 500 chars.' : null;
  const displayNameError =
    displayName.trim().length > 0 && displayName.trim().length > 80
      ? 'Display name is over 80 chars.'
      : null;
  const hasAnyError = Boolean(
    hourlyRateError || portfolioError || bioError || displayNameError,
  );

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v) || skills.length >= 20) return;
    setSkills((prev) => [...prev, v]);
    setSkillInput('');
  };
  const removeSkill = (s: string) =>
    setSkills((prev) => prev.filter((x) => x !== s));

  const handleSave = () => {
    updateMut.mutate({
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      // Always send `skills` and `portfolioUrl` (even empty) so the
      // user can clear them — the API treats `undefined` as "no
      // change", `[]` / `''` as "clear".
      skills,
      hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
      country: country.trim() || undefined,
      timezone: timezone.trim() || undefined,
      portfolioUrl: portfolioUrl.trim(),
    });
  };

  return (
    // Tighter outer rhythm — was space-y-6 which left ~24px of dead
    // space between every card. space-y-5 keeps them readable as
    // separate cards without feeling disconnected.
    <div className="space-y-5">
      {/* Avatar uploader + identity summary. Read-only role badge —
          this is the at-a-glance "who am I logged in as" header; the
          editable display name lives inside the About-you card below. */}
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

      {/* Identity — name + bio */}
      <ProfileSection
        title="About you"
        description="What clients and freelancers see on your public profile."
      >
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 80))}
            className="mt-1.5"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio">Bio</Label>
            {/* Counter inline with the label so it doesn't dangle below
                a full-width textarea — keeps the visual weight balanced. */}
            <span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
              {bio.length}/500
            </span>
          </div>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            rows={3}
            className="mt-1.5"
            placeholder="One or two lines about your work, focus, and what you bring to a project."
          />
        </div>
      </ProfileSection>

      {/* Freelancer-side details — skills + rate + portfolio. Same
          form regardless of mode; client-only users just leave them
          empty (or filled them in via lazy escalation when applying). */}
      <ProfileSection
        title="Freelancer details"
        description="Shown when clients evaluate you for a job or service. Required to apply to a job."
      >
        <div>
          <Label htmlFor="skills">Skills</Label>
          {/* Skills entry row — input takes the full width minus the
              compact Add button. Add button is `size="sm"` so it
              doesn't overpower a long-placeholder input. Enter/comma
              also trigger add (faster than reaching for the button). */}
          <div className="mt-1.5 flex gap-2">
            <Input
              id="skills"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="e.g. React, Solidity, Brand identity… (press Enter to add)"
              maxLength={40}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addSkill}
              disabled={!skillInput.trim() || skills.length >= 20}
              leftIcon={<Plus />}
              className="shrink-0 self-stretch"
            >
              Add
            </Button>
          </div>
          {skills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
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
            <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
              Pick 1–20. Clients filter on these.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="hourlyRate">Hourly rate (USDC)</Label>
            {/* `$` prefix matches the escalation modal so a user
                going Apply-to-job → lazy-escalation → later-edit-in-
                settings sees the same affordance. Currency unit is
                in the label since USDC pegs to USD. */}
            <div className="relative mt-1.5">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-tertiary)]"
              >
                $
              </span>
              <Input
                id="hourlyRate"
                type="number"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="50"
                aria-invalid={hourlyRateError ? true : undefined}
                aria-describedby={hourlyRateError ? 'hourlyRate-err' : undefined}
                className={cn(
                  'pl-7',
                  hourlyRateError &&
                    'border-[var(--color-error)] focus:border-[var(--color-error)]',
                )}
              />
            </div>
            {hourlyRateError ? (
              <p
                id="hourlyRate-err"
                role="alert"
                className="mt-1 text-xs text-[var(--color-error)]"
              >
                {hourlyRateError}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="portfolio">Portfolio URL</Label>
            <div className="relative mt-1.5">
              <LinkIcon
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <Input
                id="portfolio"
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value.slice(0, 500))}
                placeholder="https://your-portfolio.com"
                aria-invalid={portfolioError ? true : undefined}
                aria-describedby={portfolioError ? 'portfolio-err' : undefined}
                className={cn(
                  'pl-8',
                  portfolioError &&
                    'border-[var(--color-error)] focus:border-[var(--color-error)]',
                )}
              />
            </div>
            {portfolioError ? (
              <p
                id="portfolio-err"
                role="alert"
                className="mt-1 text-xs text-[var(--color-error)]"
              >
                {portfolioError}
              </p>
            ) : null}
          </div>
        </div>
      </ProfileSection>

      {/* Location — country + timezone. Both icon-prefixed so the
          card reads as a coherent pair instead of one bare + one
          decorated. */}
      <ProfileSection
        title="Location"
        description="Helps match collaborators who share working hours."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="country">Country</Label>
            <div className="relative mt-1.5">
              <MapPin
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value.slice(0, 80))}
                placeholder="e.g. Indonesia"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <div className="relative mt-1.5">
              <Globe
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value.slice(0, 80))}
                placeholder="e.g. Asia/Jakarta"
                className="pl-8"
                list="tz-suggestions"
              />
              {/* Datalist for common IANA timezones — autocomplete
                  hints, not enforced. Users in unusual zones can
                  still type freely. */}
              <datalist id="tz-suggestions">
                <option value="Asia/Jakarta" />
                <option value="Asia/Singapore" />
                <option value="Asia/Manila" />
                <option value="Asia/Tokyo" />
                <option value="Asia/Kolkata" />
                <option value="Europe/London" />
                <option value="Europe/Berlin" />
                <option value="America/New_York" />
                <option value="America/Los_Angeles" />
                <option value="Australia/Sydney" />
              </datalist>
            </div>
          </div>
        </div>
      </ProfileSection>

      <div className="flex flex-col items-end gap-2">
        {/* Surfaces field-level errors at the save row so a user
            scrolling past invalid fields still sees why Save is
            disabled. Only shown when there's at least one error. */}
        {hasAnyError ? (
          <p className="text-xs text-[var(--color-error)]" role="status">
            Fix the highlighted fields above before saving.
          </p>
        ) : null}
        <Button
          onClick={handleSave}
          isLoading={updateMut.isPending}
          disabled={hasAnyError}
          leftIcon={<Save />}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

/** Card wrapper for a logical section inside ProfileTab. Keeps the
 *  three sections (about / freelancer / location) visually grouped
 *  without the whole page being one giant scroll. */
function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
      <h3 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNT TAB — wallet, identity, data export
   ───────────────────────────────────────────────────────────────
   Delete-account moved to the Security tab's Danger Zone where
   destructive actions live alongside the recovery/sign-out controls.
   The shape here is now strictly "who you are" + "your money".
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
          <Row
            label="Email"
            value={
              user.email ? (
                // Privy verifies email at link time (magic-link or
                // OAuth), so anything on file IS verified. Surface
                // that confidence to the user so they don't worry.
                <span className="inline-flex items-center gap-1.5">
                  {user.email}
                  <span
                    title="Verified by Privy at sign-in"
                    className="inline-flex items-center gap-0.5 rounded-[var(--radius-full)] bg-[var(--color-brand-primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-brand-primary)]"
                  >
                    <CheckCircle2 className="size-3" />
                    Verified
                  </span>
                </span>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">
                  Not set —{' '}
                  <span className="text-[var(--color-text-secondary)]">
                    add a sign-in method in Security
                  </span>
                </span>
              )
            }
          />
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

      {/* Data Export — GDPR-style download. Kept in Account because
          it's about what we hold ON YOU; the Security tab is about
          how to protect/recover access. */}
      <DataExportCard />
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
// (DeleteAccountCard moved to components/settings/delete-account-card.tsx —
// rendered inside the Security tab's Danger Zone now.)

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
