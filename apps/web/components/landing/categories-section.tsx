'use client';

import { motion } from 'framer-motion';
import {
  Code2,
  Palette,
  PenLine,
  Megaphone,
  Video,
  Mic,
  Database,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = [
  { label: 'Development', icon: Code2, tagline: 'Web, mobile, smart contracts', color: 'var(--color-brand-primary)' },
  { label: 'Design', icon: Palette, tagline: 'UI/UX, branding, 3D', color: 'var(--color-brand-secondary)' },
  { label: 'Writing', icon: PenLine, tagline: 'Copy, technical, content', color: 'var(--color-brand-accent)' },
  { label: 'Marketing', icon: Megaphone, tagline: 'Growth, SEO, ads', color: 'var(--color-warning)' },
  { label: 'Video', icon: Video, tagline: 'Editing, motion, animation', color: '#FF6B6B' },
  { label: 'Audio', icon: Mic, tagline: 'Voice-over, mixing, music', color: '#E879F9' },
  { label: 'Data', icon: Database, tagline: 'Analytics, ML, research', color: 'var(--color-info)' },
  { label: 'Other', icon: Sparkles, tagline: 'Niche & specialist skills', color: '#A0A7C4' },
];

export function CategoriesSection() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-brand-primary)]">
            Categories
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight text-[var(--color-text-primary)]">
            Find work in your expertise
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <Link
                href={`/jobs?category=${cat.label.toLowerCase()}`}
                className="group flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 transition-all duration-200 hover:border-[var(--color-border-strong)] hover:-translate-y-1 hover:shadow-lg"
              >
                <div
                  className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] transition-colors duration-200"
                  style={{ backgroundColor: `${cat.color}15` }}
                >
                  <cat.icon className="size-6 transition-transform duration-200 group-hover:scale-110" style={{ color: cat.color }} />
                </div>
                <span className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                  {cat.label}
                </span>
                <span className="text-center text-xs text-[var(--color-text-tertiary)]">{cat.tagline}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
