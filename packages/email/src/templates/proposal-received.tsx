import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface ProposalReceivedEmailProps {
  clientName: string;
  freelancerName: string;
  jobTitle: string;
  bidAmount: string;
  jobId: string;
}

export function ProposalReceivedEmail({
  clientName,
  freelancerName,
  jobTitle,
  bidAmount,
  jobId,
}: ProposalReceivedEmailProps) {
  return (
    <EmailLayout preview={`${freelancerName} sent a proposal for "${jobTitle}"`}>
      <Heading>New proposal for your job</Heading>
      <Paragraph>Hi {clientName},</Paragraph>
      <Paragraph>
        <strong>{freelancerName}</strong> just submitted a proposal for <strong>{jobTitle}</strong>{' '}
        at <strong>{bidAmount} USDC</strong>.
      </Paragraph>
      <CtaButton href={`${appUrl}/jobs/${jobId}`} label="Review Proposal" />
    </EmailLayout>
  );
}

ProposalReceivedEmail.PreviewProps = {
  clientName: 'Alex',
  freelancerName: 'Jordan',
  jobTitle: 'Build a landing page in Next.js',
  bidAmount: '1,200',
  jobId: 'abc-123',
} satisfies ProposalReceivedEmailProps;

export default ProposalReceivedEmail;
