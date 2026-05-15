import { appUrl } from '../theme';
import { CtaButton, EmailLayout, Heading, Paragraph } from './_layout';

interface ContractFundedEmailProps {
  freelancerName: string;
  jobTitle: string;
  amount: string;
  contractId: string;
  txHash: string;
}

export function ContractFundedEmail({
  freelancerName,
  jobTitle,
  amount,
  contractId,
  txHash,
}: ContractFundedEmailProps) {
  return (
    <EmailLayout preview={`Escrow funded for "${jobTitle}" — you can start working`}>
      <Heading>Escrow funded — you can start working</Heading>
      <Paragraph>Hi {freelancerName},</Paragraph>
      <Paragraph>
        The client just locked <strong>{amount} USDC</strong> in escrow for{' '}
        <strong>{jobTitle}</strong>. This is verifiable on-chain.
      </Paragraph>
      <Paragraph>
        Transaction:{' '}
        <a href={`https://basescan.org/tx/${txHash}`} style={{ color: '#00D4FF' }}>
          View on BaseScan
        </a>
      </Paragraph>
      <CtaButton href={`${appUrl}/contracts/${contractId}`} label="Open Contract" />
    </EmailLayout>
  );
}

ContractFundedEmail.PreviewProps = {
  freelancerName: 'Jordan',
  jobTitle: 'Build a landing page',
  amount: '1,200',
  contractId: 'contract-123',
  txHash: '0xabc123',
} satisfies ContractFundedEmailProps;

export default ContractFundedEmail;
