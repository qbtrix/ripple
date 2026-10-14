// widgets/composite/InvoiceLayout.test.ts: the invoice card's contract. The
// hero amount equals the table's Total, the number never gets a doubled `#`,
// unknown statuses get a neutral chip, blank model strings leave no orphan
// labels, missing parties do not throw, and the action buttons render and fire.
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import InvoiceLayout from './InvoiceLayout.svelte';
import { invoiceLayoutEntry } from '$lib/manifest/entries/invoice-layout.js';

afterEach(cleanup);

const example = invoiceLayoutEntry.example!.props as Record<string, unknown>;

// Worst-case model output: blanks, string numbers, an out-of-union status.
const missing = {
  from: { name: 'Fieldnote Repairs' },
  billTo: { name: '' },
  invoiceNumber: '#0042',
  issueDate: '',
  status: 'pending',
  currency: 'USD',
  lines: [
    { description: 'Diagnostic visit' },
    { description: 'Replacement valve', quantity: '2', unitPrice: '38.50' },
    { description: 'Labour', quantity: 3, unitPrice: 'n/a' },
    { description: '', total: 15 },
    { description: 'Travel', amount: 22 },
  ],
  summary: [
    { label: 'Subtotal', value: 'see below' },
    { label: 'Sales tax', amount: 9.12 },
    { label: 'Deposit received', value: 50, isNegative: true },
    { label: 'Total', value: 120 },
  ],
  paymentMethods: [{ label: 'Cash' }, { label: '' }],
  notes: '',
  actions: [{ label: 'Mark as paid' }, { id: 'x', label: '' }],
};

const hero = (c: HTMLElement) => c.querySelector('.rinv-amount')?.textContent?.trim();
const tableTotal = (c: HTMLElement) => c.querySelector('.ril-total .ril-num')?.textContent?.trim();

test('the hero amount equals the table Total and leads with the due sentence', () => {
  const { container } = render(InvoiceLayout, { props: example as never });
  expect(hero(container)).toBe('$5,316.50');
  expect(tableTotal(container)).toBe('$5,316.50');
  expect(container.querySelector('.rinv-when')?.textContent).toBe('Due May 31, 2026 · Net 30');
  expect(container.querySelector('.rinv-chip')?.textContent).toBe('Sent');
  cleanup();
  const { container: c5 } = render(InvoiceLayout, { props: missing as never });
  expect(hero(c5)).toBe('$120.00');
  expect(tableTotal(c5)).toBe('$120.00');
});

test('one leading # is stripped, never added', () => {
  const { container } = render(InvoiceLayout, { props: missing as never });
  expect(container.querySelector('.rinv-num')?.textContent).toBe('0042');
  expect(container.textContent).not.toContain('#');
});

test('an unknown status gets a neutral chip with the model word', () => {
  const { container } = render(InvoiceLayout, { props: missing as never });
  const chip = container.querySelector('.rinv-chip');
  expect(chip?.textContent).toBe('Pending');
  expect(chip?.getAttribute('data-tone')).toBe('neutral');
});

test('blank fields leave no orphan labels', () => {
  const { container } = render(InvoiceLayout, { props: missing as never });
  const labels = [...container.querySelectorAll('.rinv-label, dt')].map((l) => l.textContent);
  expect(labels).not.toContain('Bill to');
  expect(labels).not.toContain('Issue date');
  expect(labels).not.toContain('Notes');
  expect(container.querySelector('.rinv-when')).toBeNull();
  expect(container.querySelectorAll('.rinv-pay li')).toHaveLength(1);
  expect(container.textContent).not.toContain('NaN');
});

test('a missing billTo or from does not throw', () => {
  const { from: _f, billTo: _b, ...rest } = example;
  const { container } = render(InvoiceLayout, { props: rest as never });
  expect(hero(container)).toBe('$5,316.50');
  expect(container.textContent).not.toContain('Bill to');
});

test('no lines: a muted row, a dash hero, no totals', () => {
  const { container } = render(InvoiceLayout, { props: { ...example, lines: 'oops' } as never });
  expect(container.querySelector('.rinv-empty')?.textContent).toBe('No line items');
  expect(hero(container)).toBe('—');
  expect(container.querySelector('.ril-total')).toBeNull();
});

test('quote and void sentences follow docType and status', () => {
  const { container } = render(InvoiceLayout, {
    props: { ...example, docType: 'Quote', status: 'draft', dueDate: 'Valid until Dec 31, 2026' } as never,
  });
  expect(container.querySelector('.rinv-when')?.textContent).toBe('Valid until Dec 31, 2026');
  expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toContain('Valid until');
  cleanup();
  const { container: v } = render(InvoiceLayout, { props: { ...example, status: 'void' } as never });
  expect(v.querySelector('.rinv-when')?.textContent).toBe('Void · issued May 1, 2026');
  expect(v.querySelector('.rinv-amount.rinv-void')).not.toBeNull();
});

test('actions render, blank labels drop, and onaction fires with a derived id', () => {
  const onaction = vi.fn();
  const { container } = render(InvoiceLayout, { props: { ...missing, onaction } as never });
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('.rinv-btn')];
  expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Mark as paid']);
  buttons[0].click();
  expect(onaction).toHaveBeenCalledWith('mark-as-paid');
  cleanup();
  const { container: c1 } = render(InvoiceLayout, { props: example as never });
  expect([...c1.querySelectorAll('.rinv-btn')].map((b) => b.textContent?.trim())).toEqual(['Download PDF', 'Pay invoice']);
});
