import type { Metadata } from 'next';
import { ServicesDiscover } from './services-discover';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Hire trusted freelancers for productised services — design, development, writing, and more. Every order is escrow-protected on Base.',
};

export default function ServicesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <ServicesDiscover />
    </div>
  );
}
