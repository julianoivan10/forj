import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface DisputeOpenedEmailProps {
  recipientName: string;
  openerName: string;
  jobTitle: string;
  reason: string;
  contractId: string;
}

export function DisputeOpenedEmail({
  recipientName,
  openerName,
  jobTitle,
  reason,
  contractId,
}: DisputeOpenedEmailProps) {
  return (
    <EmailLayout preview={`Dispute opened on "${jobTitle}"`}>
      <Heading>A dispute was opened</Heading>
      <Paragraph>Hi {recipientName},</Paragraph>
      <Paragraph>
        <strong>{openerName}</strong> has opened a dispute on <strong>{jobTitle}</strong>.
      </Paragraph>
      <Paragraph>Reason: {reason}</Paragraph>
      <Paragraph>
        The escrow is now paused. A WorkChain arbitrator will review both sides and make a
        resolution within 48 hours.
      </Paragraph>
      <CtaButton href={`${appUrl}/contracts/${contractId}`} label="Open Contract" />
    </EmailLayout>
  );
}

DisputeOpenedEmail.PreviewProps = {
  recipientName: 'Alex',
  openerName: 'Jordan',
  jobTitle: 'Build a landing page',
  reason: 'Scope was not fully delivered',
  contractId: 'contract-123',
} satisfies DisputeOpenedEmailProps;

export default DisputeOpenedEmail;
