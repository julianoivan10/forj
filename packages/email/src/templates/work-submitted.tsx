import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface WorkSubmittedEmailProps {
  clientName: string;
  freelancerName: string;
  jobTitle: string;
  contractId: string;
  autoReleaseDate: string;
}

export function WorkSubmittedEmail({
  clientName,
  freelancerName,
  jobTitle,
  contractId,
  autoReleaseDate,
}: WorkSubmittedEmailProps) {
  return (
    <EmailLayout preview={`${freelancerName} submitted work for "${jobTitle}"`}>
      <Heading>Work submitted — ready for your review</Heading>
      <Paragraph>Hi {clientName},</Paragraph>
      <Paragraph>
        <strong>{freelancerName}</strong> has submitted work for <strong>{jobTitle}</strong>.
      </Paragraph>
      <Paragraph>
        You have until <strong>{autoReleaseDate}</strong> to review and approve, or request a
        revision. If no action is taken by that date, the escrow will auto-release.
      </Paragraph>
      <CtaButton href={`${appUrl}/contracts/${contractId}`} label="Review Submission" />
    </EmailLayout>
  );
}

WorkSubmittedEmail.PreviewProps = {
  clientName: 'Alex',
  freelancerName: 'Jordan',
  jobTitle: 'Build a landing page',
  contractId: 'contract-123',
  autoReleaseDate: 'April 30, 2026',
} satisfies WorkSubmittedEmailProps;

export default WorkSubmittedEmail;
