'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button, Input, Label, Skeleton, Textarea } from '@/components/ui';
import { AuthGate } from '@/components/auth/auth-gate';
import { api } from '@/lib/trpc/client';
import { JOB_CATEGORIES } from '@/lib/constants';

const TIER_DEFAULTS = [
  { label: 'Basic', price: 100, deliveryDays: 7, revisions: 1 },
  { label: 'Standard', price: 300, deliveryDays: 14, revisions: 3 },
  { label: 'Premium', price: 600, deliveryDays: 21, revisions: -1 },
];

type Category = (typeof JOB_CATEGORIES)[number]['value'];

interface Tier {
  label: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
}

/**
 * Service publishing form. Three-tier pattern (Basic/Standard/Premium) is
 * the Fiverr standard — buyers convert better when they have a clear
 * "good / better / best" choice. We default to that shape but the user
 * can drop to a single tier if they want.
 */
export default function NewServicePage() {
  return (
    <AuthGate mode="onboarded">
      <NewServiceInner />
    </AuthGate>
  );
}

function NewServiceInner() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('design');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [tiers, setTiers] = useState<Tier[]>(
    TIER_DEFAULTS.map((t) => ({ ...t, features: [''] })),
  );

  const createMut = api.service.create.useMutation({
    onSuccess: (s) => {
      toast.success('Service published');
      router.push(`/services/${s!.slug}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v) || skills.length >= 20) return;
    setSkills((s) => [...s, v]);
    setSkillInput('');
  };
  const removeSkill = (s: string) => setSkills((arr) => arr.filter((x) => x !== s));

  const updateTier = (i: number, patch: Partial<Tier>) => {
    setTiers((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const addTierFeature = (i: number) => {
    setTiers((arr) =>
      arr.map((t, idx) => (idx === i ? { ...t, features: [...t.features, ''] } : t)),
    );
  };
  const updateTierFeature = (tierIdx: number, fIdx: number, val: string) => {
    setTiers((arr) =>
      arr.map((t, idx) =>
        idx === tierIdx
          ? { ...t, features: t.features.map((f, j) => (j === fIdx ? val : f)) }
          : t,
      ),
    );
  };
  const removeTierFeature = (tierIdx: number, fIdx: number) => {
    setTiers((arr) =>
      arr.map((t, idx) =>
        idx === tierIdx
          ? { ...t, features: t.features.filter((_, j) => j !== fIdx) }
          : t,
      ),
    );
  };
  const removeTier = (i: number) => {
    if (tiers.length <= 1) return;
    setTiers((arr) => arr.filter((_, idx) => idx !== i));
  };

  const isValid =
    title.length >= 10 &&
    tagline.length >= 20 &&
    description.length >= 40 &&
    tiers.every(
      (t) =>
        t.label.trim().length > 0 &&
        t.price > 0 &&
        t.deliveryDays > 0 &&
        t.features.filter((f) => f.trim()).length >= 1,
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      toast.error('Fill in title, description, and at least one feature per tier');
      return;
    }
    createMut.mutate({
      title: title.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      category,
      skills,
      tiers: tiers.map((t) => ({
        ...t,
        features: t.features.filter((f) => f.trim()),
      })),
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/services"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> Back to services
      </Link>

      <header>
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
          <Sparkles className="size-3.5" /> New service
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Publish a productised offering
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
          Pick a pattern of work you can deliver repeatedly, set 1-3 tiers, and let
          clients buy without the proposal round-trip.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
        {/* Section: Basics */}
        <Section title="Basics" description="What are you selling?">
          <div>
            <Label htmlFor="title">Service title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="I will design a modern logo for your startup"
              className="mt-1.5"
              maxLength={120}
            />
            <CharCount value={title} min={10} max={120} />
          </div>

          <div>
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value.slice(0, 200))}
              placeholder="Clean, scalable logos delivered in 3 days, with source files"
              className="mt-1.5"
            />
            <CharCount value={tagline} min={20} max={200} />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              rows={6}
              placeholder="Walk buyers through what they get, your process, and what you need from them."
              className="mt-1.5"
            />
            <CharCount value={description} min={40} max={5000} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="mt-1.5 h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] px-3 text-sm text-[var(--color-text-primary)]"
              >
                {JOB_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Skills</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="React"
                />
                <Button type="button" variant="outline" onClick={addSkill}>
                  Add
                </Button>
              </div>
              {skills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-primary)]"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => removeSkill(s)}
                        aria-label={`Remove ${s}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Section>

        {/* Section: Tiers */}
        <Section
          title="Pricing tiers"
          description="1–3 packages. Buyers convert best with a clear good / better / best ladder."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {tiers.map((tier, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-elevated)] p-4"
              >
                <div className="flex items-center justify-between">
                  <Input
                    value={tier.label}
                    onChange={(e) => updateTier(i, { label: e.target.value.slice(0, 40) })}
                    className="max-w-[140px]"
                  />
                  {tiers.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeTier(i)}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
                      aria-label="Remove tier"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wide">Price (USDC)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={tier.price}
                    onChange={(e) => updateTier(i, { price: Number(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide">Days</Label>
                    <Input
                      type="number"
                      min="1"
                      value={tier.deliveryDays}
                      onChange={(e) =>
                        updateTier(i, { deliveryDays: Number(e.target.value) || 1 })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide">Revisions</Label>
                    <Input
                      type="number"
                      min="-1"
                      value={tier.revisions}
                      onChange={(e) =>
                        updateTier(i, { revisions: Number(e.target.value) || 0 })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wide">Includes</Label>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {tier.features.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1">
                        <Input
                          value={f}
                          onChange={(e) =>
                            updateTierFeature(i, fi, e.target.value.slice(0, 120))
                          }
                          placeholder="Feature description"
                        />
                        {tier.features.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeTierFeature(i, fi)}
                            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
                            aria-label="Remove feature"
                          >
                            <X className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {tier.features.length < 8 ? (
                      <button
                        type="button"
                        onClick={() => addTierFeature(i)}
                        className="inline-flex items-center gap-1 self-start text-xs text-[var(--color-brand-primary)] hover:underline"
                      >
                        <Plus className="size-3" /> Add feature
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {tiers.length < 3 ? (
              <button
                type="button"
                onClick={() =>
                  setTiers((arr) => [
                    ...arr,
                    {
                      label: 'New tier',
                      price: 100,
                      deliveryDays: 7,
                      revisions: 1,
                      features: [''],
                    },
                  ])
                }
                className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/40 p-4 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
              >
                <Plus className="size-4" />
                Add tier
              </button>
            ) : null}
          </div>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={!isValid} isLoading={createMut.isPending}>
            Publish service
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{description}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function CharCount({ value, min, max }: { value: string; min: number; max: number }) {
  const len = value.length;
  const tooShort = len > 0 && len < min;
  return (
    <p
      className={`mt-1 text-right text-[11px] ${
        tooShort ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-tertiary)]'
      }`}
    >
      {len}/{max} {tooShort ? `(min ${min})` : ''}
    </p>
  );
}

// Touch unused import to avoid TS noUnusedLocals.
void Skeleton;
