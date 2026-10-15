// src/lib/widgets/vertical/invoice-math.ts: the arithmetic behind
// invoice-lines and the invoice-layout hero, in one place so the hero amount
// and the table's Total can never disagree.
//
// Amounts are model output. A line reads `total`, then `amount`, then
// quantity x unitPrice (numeric strings count); with none of those it is
// unknown (undefined), shows a dash and stays out of the sum. A summary row
// reads `value`, then `amount`, then `total`.
//
// The model's figures win: an explicit `subtotal` / `total` prop, else a
// summary row labelled like "Subtotal" / "Total" stands in for that row and
// never prints as an extra. When a shown figure disagrees with what its rows
// add to (0.01 or more), the result carries the sum so the table can say so.
import { finite, money } from '$lib/widgets/data-kit/format.js';

export type InvoiceLine = {
  id?: string | number;
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  total?: number | string;
  amount?: number | string;
  note?: string;
};

export type SummaryRow = {
  label?: string;
  value?: number | string;
  amount?: number | string;
  total?: number | string;
  isNegative?: boolean;
};

export function lineAmount(l: InvoiceLine): number | undefined {
  const t = finite(l?.total) ?? finite(l?.amount);
  if (t !== undefined) return t;
  const q = finite(l?.quantity);
  const u = finite(l?.unitPrice);
  return q !== undefined && u !== undefined ? q * u : undefined;
}

export function summaryValue(s: SummaryRow): number | undefined {
  const v = finite(s?.value) ?? finite(s?.amount) ?? finite(s?.total);
  return v === undefined ? undefined : s.isNegative ? -Math.abs(v) : v;
}

const label = (s: SummaryRow) => String(s?.label ?? '').trim();
export const isSubtotalRow = (s: SummaryRow) => /subtotal/i.test(label(s));
// Checked after the subtotal rule, so "Subtotal" never lands here.
export const isTotalRow = (s: SummaryRow) =>
  !isSubtotalRow(s) && /^(grand\s+)?total(\s+due)?$|^amount\s+due$/i.test(label(s));

const differs = (a: number, b: number) => Math.abs(a - b) >= 0.0099;

export type InvoiceTotals = {
  subtotal: number;
  subtotalLabel: string;
  /** Sum of the lines, set only when every line has an amount and it differs from `subtotal`. */
  linesAddTo?: number;
  extras: SummaryRow[];
  total: number;
  /** Subtotal plus extras, set only when the shown total differs from it. */
  rowsAddTo?: number;
};

export function invoiceTotals(input: {
  lines: InvoiceLine[];
  summary?: SummaryRow[];
  subtotal?: unknown;
  total?: unknown;
}): InvoiceTotals {
  const summary = input.summary ?? [];
  const amounts = input.lines.map(lineAmount);
  const lineSum = amounts.reduce<number>((acc, n) => acc + (n ?? 0), 0);
  const allKnown = amounts.every((n) => n !== undefined);

  const subRow = summary.find(isSubtotalRow);
  const totalRow = summary.find(isTotalRow);
  const extras = summary.filter((s) => !isSubtotalRow(s) && !isTotalRow(s));

  const explicitSub = finite(input.subtotal);
  const subtotal = explicitSub ?? (subRow ? summaryValue(subRow) : undefined) ?? lineSum;
  const subtotalLabel = explicitSub === undefined && subRow && label(subRow) ? label(subRow) : 'Subtotal';

  const rowsSum = subtotal + extras.reduce((acc, s) => acc + (summaryValue(s) ?? 0), 0);
  const shownTotal = finite(input.total) ?? (totalRow ? summaryValue(totalRow) : undefined);
  const total = shownTotal ?? rowsSum;

  return {
    subtotal,
    subtotalLabel,
    linesAddTo: allKnown && input.lines.length > 0 && differs(subtotal, lineSum) ? lineSum : undefined,
    extras,
    total,
    rowsAddTo: shownTotal !== undefined && differs(shownTotal, rowsSum) ? rowsSum : undefined,
  };
}

/** Money for display: a symbol prefix ("$") or an ISO code ("USD") through Intl.
 *  Negatives carry a true minus tight to the symbol; unknown is a dash. */
export function formatAmount(n: number | undefined, currency = '$'): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (/^[A-Za-z]{3}$/.test(currency)) return money(n, currency).replace(/^-/, '−');
  const sign = n < 0 ? '−' : '';
  return `${sign}${currency}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
