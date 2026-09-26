import { feeExample, formatUsdc } from './chain-facts';
import { SectionHeading } from './section-heading';

const RECORD = [
  { title: 'Checkout flow redesign', amount: 2_400n, date: 'Apr 2026', tx: '0x7c1e…a93f' },
  { title: 'Solidity test suite', amount: 1_000n, date: 'Mar 2026', tx: '0x21bd…04e7' },
  { title: 'Brand illustration set', amount: 650n, date: 'Feb 2026', tx: '0xe90a…5b12' },
] as const;

export function OwnershipSection() {
  return (
    <section
      aria-labelledby="ownership"
      className="border-t border-[var(--color-border-default)] py-20 sm:py-28"
    >
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <SectionHeading
            id="ownership"
            index="05"
            label="Reputation"
            title="Your work history should belong to you."
          />
          <p className="mt-6 text-lg leading-relaxed text-[var(--color-text-secondary)] text-pretty">
            Each completed contract gets a public proof page with the amount, the dates and a link
            to the release transaction. Share it anywhere. Anyone can check it without trusting
            Forj.
          </p>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
            Example record
          </p>
          <table className="mt-3 w-full border-t border-[var(--color-border-strong)] text-left">
            <caption className="sr-only">Example of completed contracts on a freelancer’s record</caption>
            <thead className="hidden sm:table-header-group">
              <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                <th scope="col" className="py-3 font-normal">Contract</th>
                <th scope="col" className="py-3 text-right font-normal">Paid out</th>
                <th scope="col" className="py-3 pl-6 text-right font-normal">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {RECORD.map((row) => (
                <tr
                  key={row.title}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-[var(--color-border-default)] py-4 sm:table-row sm:py-0"
                >
                  <td className="sm:py-4">
                    <span className="block font-display text-base font-semibold text-[var(--color-text-primary)]">
                      {row.title}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                      Released · {row.date}
                    </span>
                  </td>
                  <td className="text-right font-mono text-sm text-[var(--color-text-primary)] tabular-nums sm:py-4">
                    {formatUsdc(feeExample(row.amount).payout)}
                    <span className="text-[var(--color-text-tertiary)]"> USDC</span>
                  </td>
                  <td className="col-span-2 font-mono text-xs text-[var(--color-text-secondary)] sm:col-span-1 sm:py-4 sm:pl-6 sm:text-right">
                    <span className="sm:hidden">tx </span>
                    {row.tx}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
