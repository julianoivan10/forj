import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface WelcomeEmailProps {
  displayName: string;
  role: 'client' | 'freelancer' | 'both';
}

export function WelcomeEmail({ displayName, role }: WelcomeEmailProps) {
  const nextAction =
    role === 'client'
      ? { href: `${appUrl}/jobs/post`, label: 'Post Your First Job' }
      : { href: `${appUrl}/jobs`, label: 'Find Your First Job' };

  return (
    <EmailLayout preview={`Welcome to WorkChain, ${displayName}!`}>
      <Heading>Welcome to WorkChain, {displayName}!</Heading>
      <Paragraph>
        You are now part of a new way to work — where trust is built-in, payments are transparent,
        and your reputation travels with you on-chain.
      </Paragraph>
      <Paragraph>
        {role === 'client'
          ? 'Post a job and get matched with verified talent worldwide. Funds are held in smart-contract escrow until you approve the work.'
          : 'Browse jobs, submit proposals, and get paid the moment your work is approved — no invoicing, no delays.'}
      </Paragraph>
      <CtaButton href={nextAction.href} label={nextAction.label} />
      <Paragraph>Need help? Reply to this email — we read every message.</Paragraph>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  displayName: 'Rafi',
  role: 'freelancer',
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
