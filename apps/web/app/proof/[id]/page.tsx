import type { Metadata } from 'next';
import { ProofView } from './proof-view';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/proof/[contractId]` is the public, share-anywhere receipt page.
 *
 * No auth gate — the whole point is that a freelancer can drop this URL in
 * a portfolio site, a tweet, a LinkedIn post, and any visitor can verify
 * the on-chain settlement themselves via Basescan links.
 *
 * The metadata below feeds the social-card preview when the link is shared
 * (Twitter, LinkedIn, Discord, etc) — that's where most of the viral pickup
 * happens for portfolio links.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Verified work · Forj',
    description: `On-chain proof of completed work and payment, settled in USDC on Base. Verifiable independently of Forj.`,
    openGraph: {
      title: 'Verified on Forj',
      description: 'On-chain proof of completed work and payment.',
      type: 'article',
      url: `/proof/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Verified on Forj',
      description: 'On-chain proof of completed work and payment.',
    },
  };
}

export default async function ProofPage({ params }: PageProps) {
  const { id } = await params;
  return <ProofView contractId={id} />;
}
