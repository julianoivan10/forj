/**
 * Turn wallet / RPC / contract errors into one sentence a non-crypto user
 * can act on. Unknown errors fall through unchanged when short.
 */
export function humanizeWalletError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('user rejected') || m.includes('user denied') || m.includes('rejected the request')) {
    return 'You cancelled in your wallet. Nothing was sent.';
  }
  if (m.includes('transfer amount exceeds balance') || m.includes('45524332303a207472616e7366657220616d6f756e74')) {
    return 'Not enough USDC in your wallet for the amount plus the client fee. Top up in Settings, then try again.';
  }
  if (m.includes('insufficient funds') || m.includes('exceeds the balance')) {
    return "Your wallet doesn't have enough ETH for network fees.";
  }
  if (m.includes('exceeds allowance') || m.includes('insufficient allowance')) {
    return 'USDC approval is missing. Try again; the approval step will run first.';
  }
  if (m.includes('nonce') || m.includes('replacement')) {
    return 'Your wallet has a stuck transaction. Clear it in your wallet, then try again.';
  }
  if (m.includes('does not match the target chain') || m.includes('chain mismatch') || m.includes('switch')) {
    return 'Your wallet is on the wrong network. Switch networks and try again.';
  }
  if (m.includes('feeaboveacceptedlimit')) return 'Platform fees changed since this contract was agreed. Refresh and review the new terms.';
  if (m.includes('duplicatereference')) return 'This contract already has an escrow. Refresh the page.';
  if (m.includes('revisionlimitreached')) return 'The maximum number of revisions has been used.';
  if (m.includes('deadlinepassed')) return 'The deadline for this step has passed. Refresh to see what you can do now.';
  if (m.includes('deadlinenotreached')) return 'This action unlocks when the deadline passes.';
  if (m.includes('invalidstatus') || m.includes('notclient') || m.includes('notfreelancer') || m.includes('notparty')) {
    return 'That action isn’t available at this stage any more. Refresh the page.';
  }
  if (m.includes('invaliddeadline')) return 'The delivery deadline is too close or already passed. Edit the terms first.';
  if (m.includes('reverted')) return 'The network rejected the transaction. Nothing changed.';
  return raw.length > 200 ? 'The wallet action failed. Please try again.' : raw;
}
