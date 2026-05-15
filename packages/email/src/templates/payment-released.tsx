import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface PaymentReleasedEmailProps {
  freelancerName: string;
  jobTitle: string;
  amount: string;
  txHash: string;
  contractId: string;
}

export function PaymentReleasedEmail({
  freelancerName,
  jobTitle,
  amount,
  txHash,
  contractId,
}: PaymentReleasedEmailProps) {
  return (
    <EmailLayout preview={`Payment released: ${amount} USDC for "${jobTitle}"`}>
      <Heading>Payment released — you got paid!</Heading>
      <Paragraph>Hi {freelancerName},</Paragraph>
      <Paragraph>
        The client approved your work on <strong>{jobTitle}</strong>.{' '}
        <strong>{amount} USDC</strong> has been released to your wallet.
      </Paragraph>
      <Paragraph>
        Transaction:{' '}
        <a href={`https://basescan.org/tx/${txHash}`} style={{ color: '#00D4FF' }}>
          View on BaseScan
        </a>
      </Paragraph>
      <CtaButton href={`${appUrl}/contracts/${contractId}`} label="View Contract" />
    </EmailLayout>
  );
}

PaymentReleasedEmail.PreviewProps = {
  freelancerName: 'Jordan',
  jobTitle: 'Build a landing page',
  amount: '1,140',
  txHash: '0xdef456',
  contractId: 'contract-123',
} satisfies PaymentReleasedEmailProps;

export default PaymentReleasedEmail;
