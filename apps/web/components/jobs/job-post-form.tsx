'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { Button, Input, Label, Textarea } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { useUploadThing } from '@/lib/uploadthing/client';
import { cn } from '@/lib/utils';
import {
  DURATION_LABELS,
  EXPERIENCE_LABELS,
  JOB_CATEGORIES,
} from '@/lib/constants';
import type {
  ExperienceLevel,
  JobCategory,
  JobDuration,
} from '@/components/jobs/jobs-filters';

export function JobPostForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<JobCategory>('development');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [budgetType, setBudgetType] = useState<'fixed' | 'hourly'>('fixed');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [duration, setDuration] = useState<JobDuration>('one_to_four_weeks');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing('cover', {
    onClientUploadComplete: (results) => {
      const url = results?.[0]?.serverData?.url;
      if (url) {
        setCoverImageUrl(url);
        toast.success('Cover uploaded');
      }
    },
    onUploadError: (e) => {
      toast.error(e.message);
    },
  });

  const submit = api.job.create.useMutation({
    onSuccess: (job) => {
      // After posting, drop the client back into the dashboard's "manage
      // proposals" page rather than the public job listing. They came
      // from inside the dashboard — they should stay inside the dashboard.
      // The public `/jobs/<slug>` view is for freelancers to browse, not
      // for the client to admire their own post.
      toast.success('Job posted — proposals will appear here as freelancers apply.');
      if (job) {
        router.push(`/dashboard/jobs/${job.id}`);
      } else {
        router.push('/dashboard/jobs');
      }
    },
    onError: (err) => setError(err.message),
  });

  const addSkill = (raw: string) => {
    const cleaned = raw.trim().slice(0, 40);
    if (!cleaned) return;
    if (skills.includes(cleaned)) return;
    if (skills.length >= 15) return;
    setSkills([...skills, cleaned]);
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 8) {
      setError('Title must be at least 8 characters.');
      return;
    }
    if (description.trim().length < 50) {
      setError('Description must be at least 50 characters.');
      return;
    }
    if (skills.length === 0) {
      setError('Please add at least one required skill.');
      return;
    }
    const min = Number(budgetMin);
    const max = Number(budgetMax);
    if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= 0) {
      setError('Budget range must be positive numbers.');
      return;
    }
    if (min > max) {
      setError('Minimum budget cannot exceed the maximum.');
      return;
    }

    submit.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      skills,
      coverImageUrl: coverImageUrl ?? undefined,
      budgetType,
      budgetMin: min,
      budgetMax: max,
      duration,
      experienceLevel,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <Section
        title="Job basics"
        description="A clear title and strong description attract the right freelancers."
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Build a Next.js landing page with Solidity integrations"
            maxLength={120}
          />
          <span className="self-end text-xs text-[var(--color-text-tertiary)]">
            {title.length} / 120
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={9}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the scope, deliverables, constraints, and any preferred stack. Minimum 50 characters."
          />
          <span className="self-end text-xs text-[var(--color-text-tertiary)]">
            {description.length} / 10,000
          </span>
        </div>
      </Section>

      <Section
        title="Cover image"
        description="Optional but recommended — listings with a cover get ~3× the click-through. PNG / JPG up to 4 MB."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Preview pane */}
          <div className="relative h-32 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] sm:w-56">
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-[var(--color-text-tertiary)]">
                <ImagePlus className="size-6" />
              </div>
            )}
          </div>
          {/* Action column */}
          <div className="flex flex-1 flex-col justify-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) startUpload([file]);
                  e.target.value = '';
                }}
              />
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors',
                  isUploading
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-4" />
                    {coverImageUrl ? 'Replace cover' : 'Upload cover'}
                  </>
                )}
              </span>
            </label>
            {coverImageUrl ? (
              <button
                type="button"
                onClick={() => setCoverImageUrl(null)}
                className="self-start text-xs text-[var(--color-text-tertiary)] underline-offset-4 hover:text-[var(--color-error)] hover:underline"
              >
                Remove
              </button>
            ) : (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Skip this and we&apos;ll generate a Bauhaus-style cover from your job
                category — but a real photo or mockup converts better.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Category & skills" description="Help freelancers find this job.">
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <div className="grid gap-2 sm:grid-cols-4">
            {JOB_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors',
                  category === cat.value
                    ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="skills">Required skills ({skills.length}/15)</Label>
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--color-glow-brand)] px-2.5 py-1 text-xs font-medium text-[var(--color-brand-primary)]"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="text-[var(--color-brand-primary)]/70 hover:text-[var(--color-brand-primary)]"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              id="skills"
              className="flex-1 min-w-[140px] bg-transparent px-2 py-1 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
              value={skillDraft}
              onChange={(e) => setSkillDraft(e.target.value)}
              placeholder={skills.length === 0 ? 'Type a skill and press Enter' : ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addSkill(skillDraft);
                  setSkillDraft('');
                }
                if (e.key === 'Backspace' && skillDraft === '' && skills.length > 0) {
                  const last = skills[skills.length - 1];
                  if (last) removeSkill(last);
                }
              }}
              onBlur={() => {
                if (skillDraft.trim()) {
                  addSkill(skillDraft);
                  setSkillDraft('');
                }
              }}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Budget & timeline"
        description="USDC settlement on Base. Forj fee: 5% from you (added on top) + 2% from the freelancer (deducted at release)."
      >
        <div className="flex flex-col gap-1.5">
          <Label>Budget type</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['fixed', 'hourly'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBudgetType(type)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-3 py-2.5 text-sm capitalize transition-colors',
                  budgetType === type
                    ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {type === 'fixed' ? 'Fixed price' : 'Hourly rate'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-min">
              Min {budgetType === 'hourly' ? 'per hour' : 'total'}
            </Label>
            <Input
              id="budget-min"
              inputMode="decimal"
              leftIcon={<span className="text-sm">$</span>}
              placeholder="500"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-max">
              Max {budgetType === 'hourly' ? 'per hour' : 'total'}
            </Label>
            <Input
              id="budget-max"
              inputMode="decimal"
              leftIcon={<span className="text-sm">$</span>}
              placeholder="2000"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Expected duration</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(DURATION_LABELS) as JobDuration[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors',
                  duration === d
                    ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {DURATION_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Experience level</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setExperienceLevel(level)}
                className={cn(
                  'rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors',
                  experienceLevel === level
                    ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                )}
              >
                {EXPERIENCE_LABELS[level]}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {error ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-[var(--color-border-default)] pt-6 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/dashboard/jobs')}
          disabled={submit.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          isLoading={submit.isPending}
          leftIcon={submit.isPending ? <Loader2 /> : <Plus />}
        >
          Publish job
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5 sm:p-6">
      <header>
        <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
