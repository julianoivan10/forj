import type { Metadata } from 'next';
import { UserProfile } from './user-profile';

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: `Public profile and work history for @${username} on Forj.`,
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <UserProfile username={username} />
    </div>
  );
}
