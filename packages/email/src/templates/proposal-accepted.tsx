import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface ProposalAcceptedEmailProps {
  freelancerName: string;
  jobTitle: string;
  contractId: string;
}

export function ProposalAcceptedEmail({
  freelancerName,
  jobTitle,
  contractId,
}: ProposalAcceptedEmailProps) {
  return (
    <EmailLayout preview={`Your proposal for "${jobTitle}" was accepted!`}>
      <Heading>Your proposal was accepted!</Heading>
      <Paragraph>Hi {freelancerName},</Paragraph>
      <Paragraph>
        Great news — your proposal for <strong>{jobTitle}</strong> was accepted. The client will
        fund the escrow shortly. You will get notified the moment funds are locked.
      </Paragraph>
      <CtaButton href={`${appUrl}/contracts/${contractId}`} label="View Contract" />
    </EmailLayout>
  );
}

ProposalAcceptedEmail.PreviewProps = {
  freelancerName: 'Jordan',
  jobTitle: 'Build a landing page in Next.js',
  contractId: 'contract-123',
} satisfies ProposalAcceptedEmailProps;

export default ProposalAcceptedEmail;
