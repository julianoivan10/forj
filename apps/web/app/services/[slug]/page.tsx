import type { Metadata } from 'next';
import { ServiceDetail } from './service-detail';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Service · ${slug}`,
    description: `View this freelance service on Forj — buy with USDC escrow protection.`,
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <ServiceDetail slug={slug} />;
}
