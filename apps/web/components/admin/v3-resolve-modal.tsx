'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { formatUnits, parseUnits, type Hex } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS, forjEscrowV3Abi } from '@forj/contracts';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { humanizeWalletError } from '@/lib/wallet-errors';

type Props = {
  contract: {
    id: string;
    title: string;
    totalAmount: string;
    onChainContractId: number | null;
    disputeDeadlineAt: Date | string | null;
  } | null;
  onClose: () => void;
  onDone: () => void;
};

/** Same formula as ForjEscrowV3._split(): fees apply only to the freelancer's share. */
function preview(amountUsd: string, shareBps: number) {
  const amount = parseUnits(amountUsd, 6);
  const clientFee = (amount * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
  const gross = (amount * BigInt(shareBps)) / 10_000n;
  const freelancerFee = (gross * BigInt(DEFAULT_FREELANCER_FEE_BPS)) / 10_000n;
  const clientFeeKept = (clientFee * BigInt(shareBps)) / 10_000n;
  return {
    toFreelancer: gross - freelancerFee,
    toClient: amount - gross + (clientFee - clientFeeKept),
    toFee: freelancerFee + clientFeeKept,
  };
}

const fmt = (u: bigint) => Number(formatUnits(u, 6)).toFixed(2);

/**
 * Arbiter resolution for ForjEscrowV3. The arbiter chooses only the
 * freelancer's share; the contract derives every amount and bounds the fee.
 * Sign from the connected arbiter wallet, or execute from the arbiter Safe
 * and paste the transaction hash. Either way Forj records it as pending
 * until the DisputeResolved event is confirmed.
 */
export function V3ResolveModal({ contract, onClose, onDone }: Props) {
  const [sharePct, setSharePct] = useState('50');
  const [reason, setReason] = useState('');
  const [manualHash, setManualHash] = useState('');
  const [busy, setBusy] = useState(false);
  const config = api.escrow.config.useQuery();
  const record = api.admin.recordArbiterTransaction.useMutation();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const shareBps = Math.round(Math.min(100, Math.max(0, Number(sharePct) || 0)) * 100);
  const p = contract ? preview(contract.totalAmount, shareBps) : null;
  const expired = contract?.disputeDeadlineAt ? new Date(contract.disputeDeadlineAt).getTime() < Date.now() : false;
  const reasonOk = reason.trim().length >= 20;

  const submit = async (hash?: Hex) => {
    if (!contract || contract.onChainContractId == null || !config.data?.enabled) return;
    setBusy(true);
    try {
      let txHash = hash;
      if (!txHash) {
        txHash = await writeContractAsync({
          address: config.data.escrowAddress as Hex,
          abi: forjEscrowV3Abi,
          functionName: 'resolveDispute',
          args: [BigInt(contract.onChainContractId), shareBps],
          chainId: config.data.chainId as 8453 | 84532,
          gas: 300_000n,
        });
        await publicClient?.waitForTransactionReceipt({ hash: txHash });
      }
      const r = await record.mutateAsync({ contractId: contract.id, txHash, chainId: config.data.chainId, reason: reason.trim() });
      if (r.outcome === 'confirmed') toast.success('Resolution confirmed on-chain');
      else if (r.outcome === 'failed') toast.error('The transaction did not resolve this dispute.');
      else toast.message('Resolution recorded; waiting for confirmation.');
      onDone();
    } catch (err) {
      toast.error(humanizeWalletError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={contract != null} onOpenChange={(o) => !o && !busy && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Resolve dispute · {contract?.title}</ModalTitle>
          <ModalDescription>
            Choose the freelancer’s share of the work amount. The escrow contract computes every payout and only charges fees on
            the freelancer’s share. You must not be a party to this contract.
          </ModalDescription>
        </ModalHeader>
        {expired ? (
          <p className="text-sm text-[var(--color-error)]">
            The arbiter deadline has passed. The contract no longer accepts an arbiter decision; either party can apply the default
            50/50 split.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Freelancer share (%)</span>
              <Input type="number" min={0} max={100} step={0.01} value={sharePct} onChange={(e) => setSharePct(e.target.value)} />
            </label>
            {p ? (
              <dl className="grid grid-cols-3 border border-[var(--color-border-default)] font-mono text-xs">
                <div className="border-r border-[var(--color-border-default)] p-3">
                  <dt className="text-[var(--color-text-tertiary)]">Freelancer</dt>
                  <dd className="mt-1 text-[var(--color-text-primary)]">{fmt(p.toFreelancer)}</dd>
                </div>
                <div className="border-r border-[var(--color-border-default)] p-3">
                  <dt className="text-[var(--color-text-tertiary)]">Client</dt>
                  <dd className="mt-1 text-[var(--color-text-primary)]">{fmt(p.toClient)}</dd>
                </div>
                <div className="p-3">
                  <dt className="text-[var(--color-text-tertiary)]">Fee</dt>
                  <dd className="mt-1 text-[var(--color-text-primary)]">{fmt(p.toFee)}</dd>
                </div>
              </dl>
            ) : null}
            <label className="block">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Reason (kept in the admin audit log)</span>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What evidence supports this split?" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Executed from a Safe? Paste the transaction hash</span>
              <Input value={manualHash} onChange={(e) => setManualHash(e.target.value.trim())} placeholder="0x…" className="font-mono" />
            </label>
          </div>
        )}
        <ModalFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {!expired && /^0x[0-9a-fA-F]{64}$/.test(manualHash) ? (
            <Button isLoading={busy} disabled={!reasonOk} onClick={() => submit(manualHash as Hex)}>
              Record Safe transaction
            </Button>
          ) : !expired ? (
            <Button isLoading={busy} disabled={!reasonOk || busy} onClick={() => submit()}>
              Sign as arbiter
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
