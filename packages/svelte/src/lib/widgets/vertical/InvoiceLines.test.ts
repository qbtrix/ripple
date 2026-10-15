// widgets/vertical/InvoiceLines.test.ts: invoice totals tolerate the prop
// names a model actually writes. Live chip audit (create invoice): the model
// wrote summary[].amount, the widget read summary[].value, the tax row read
// "USDNaN". amount/total are aliases, and a non-number shows "—", never NaN.
// Also: one Subtotal and one Total row, dash for unknown amounts, mismatch
// notes, and the 8-of-N collapse for long invoices.
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import InvoiceLines from './InvoiceLines.svelte';
import { createInvoice } from '../__fixtures__/live-chip-specs.js';

afterEach(cleanup);

const rowText = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll('.ril-row, .ril-sum')].find((tr) => tr.textContent?.includes(label))?.textContent ?? '';
const totalText = (c: HTMLElement) => c.querySelector('.ril-total')?.textContent ?? '';

test('create-invoice spec: summary amount renders, no NaN anywhere', () => {
  const { container } = render(Ripple, { props: { spec: createInvoice } });
  expect(container.textContent).not.toContain('NaN');
  expect(rowText(container, 'Tax (8%)')).toContain('56.40');
  expect(totalText(container)).toContain('761.40');
});

test('summary total alias, and a non-numeric amount shows a dash', () => {
  const { container } = render(InvoiceLines, {
    props: {
      lines: [{ description: 'Work', quantity: 2, unitPrice: 50 }],
      summary: [
        { label: 'Shipping', total: 10 },
        { label: 'Discount', amount: 'tbd' },
      ] as never,
    },
  });
  expect(container.textContent).not.toContain('NaN');
  expect(rowText(container, 'Shipping')).toContain('10.00');
  expect(rowText(container, 'Discount')).toContain('—');
  // The bad row drops out of the computed total instead of poisoning it.
  expect(totalText(container)).toContain('110.00');
});

test('a line amount is an alias for its total', () => {
  const { container } = render(InvoiceLines, {
    props: { lines: [{ description: 'Logo', amount: 450 }] as never },
  });
  expect(rowText(container, 'Logo')).toContain('450.00');
});

test('an ISO currency code formats as money, a symbol still prefixes', () => {
  const { container } = render(InvoiceLines, {
    props: { currency: 'USD', lines: [{ description: 'Logo', quantity: 1, unitPrice: 450 }] },
  });
  expect(rowText(container, 'Logo')).toContain('$450.00');
  expect(container.textContent).not.toContain('USD');
  cleanup();
  const { container: eur } = render(InvoiceLines, {
    props: { currency: '€', lines: [{ description: 'Logo', quantity: 1, unitPrice: 450 }] },
  });
  expect(rowText(eur, 'Logo')).toContain('€450.00');
});

test('a summary Subtotal replaces the auto row, so there is exactly one Subtotal', () => {
  const { container } = render(InvoiceLines, {
    props: {
      lines: [
        { description: 'Plan', quantity: 1, unitPrice: 20000 },
        { description: 'Setup', quantity: 1, unitPrice: 500 }
      ],
      summary: [
        { label: 'Subtotal', amount: 18000 },
        { label: 'Tax', amount: 100 }
      ]
    }
  });
  const subs = [...container.querySelectorAll('.ril-sum')].filter((r) => /subtotal/i.test(r.textContent ?? ''));
  expect(subs).toHaveLength(1);
  expect(subs[0].textContent).toContain('18,000.00');
  // The model's subtotal is not added twice: 18,000 + 100.
  expect(totalText(container)).toContain('18,100.00');
});

test('an explicit total always wins over the arithmetic', () => {
  const { container } = render(InvoiceLines, {
    props: { lines: [{ description: 'Plan', total: 50 }], summary: [{ label: 'Subtotal', amount: 40 }], total: 99 }
  });
  expect(totalText(container)).toContain('99.00');
});

test('narrow cards get a qty × unit second line instead of extra columns', () => {
  const { container } = render(InvoiceLines, {
    props: { lines: [{ description: 'Seats', quantity: 12, unitPrice: 5 }] }
  });
  expect(container.querySelector('.ril-narrow')?.textContent).toContain('12 × $5.00');
});

test('a Total summary row stands in for the total and prints once, with a rows note', () => {
  const { container } = render(InvoiceLines, {
    props: {
      lines: [{ description: 'Work', total: 100 }],
      summary: [
        { label: 'Tax', amount: 10 },
        { label: 'Total', value: 120 },
      ] as never,
    },
  });
  const totals = [...container.querySelectorAll('.ril-sum')].filter((r) => /^\s*total/i.test(r.textContent ?? ''));
  expect(totals).toHaveLength(1);
  expect(totalText(container)).toContain('120.00');
  expect(container.querySelector('.ril-note')?.textContent).toBe('Rows add to $110.00');
});

test('a line with no usable amount shows a dash, not $0.00, and stays out of the sum', () => {
  const { container } = render(InvoiceLines, {
    props: {
      lines: [
        { description: 'Visit' },
        { description: 'Labour', quantity: 3, unitPrice: 'n/a' },
        { description: 'Free', total: 0 },
        { description: 'Parts', total: 40 },
      ] as never,
    },
  });
  expect(rowText(container, 'Visit')).toContain('—');
  expect(rowText(container, 'Labour')).toContain('—');
  expect(rowText(container, 'Free')).toContain('$0.00');
  expect(totalText(container)).toContain('40.00');
});

test('string quantity and unit price give the qty × unit subline', () => {
  const { container } = render(InvoiceLines, {
    props: { lines: [{ description: 'Valve', quantity: '2', unitPrice: '38.50' }] as never },
  });
  expect(container.querySelector('.ril-narrow')?.textContent).toContain('2 × $38.50');
  expect(rowText(container, 'Valve')).toContain('$77.00');
});

test('a blank description reads Item <n> in muted ink', () => {
  const { container } = render(InvoiceLines, {
    props: { lines: [{ description: 'A', total: 1 }, { description: '  ', total: 2 }] },
  });
  const ph = container.querySelector('.ril-placeholder');
  expect(ph?.textContent).toBe('Item 2');
});

test('a Subtotal that disagrees with complete lines gets a "Lines add to" note', () => {
  const { container } = render(InvoiceLines, {
    props: {
      lines: [{ description: 'A', total: 4000 }, { description: 'B', total: 700 }],
      summary: [{ label: 'Subtotal', value: 4900 }],
    },
  });
  expect(container.querySelector('.ril-note')?.textContent).toBe('Lines add to $4,700.00');
  cleanup();
  const { container: ok } = render(InvoiceLines, {
    props: { lines: [{ description: 'A', total: 4000 }], summary: [{ label: 'Subtotal', value: 4000 }] },
  });
  expect(ok.querySelector('.ril-note')).toBeNull();
});

test('more than 12 lines collapse to 8 with a toggle; totals always show', async () => {
  const lines = Array.from({ length: 13 }, (_, i) => ({ description: `Line ${i + 1}`, total: 1 }));
  const { container } = render(InvoiceLines, { props: { lines } });
  const hidden = () => [...container.querySelectorAll('.ril-collapsed .ril-extra')].length;
  expect(hidden()).toBe(5);
  const toggle = container.querySelector<HTMLButtonElement>('.ril-toggle')!;
  expect(toggle.textContent?.trim()).toBe('Show all 13 lines');
  expect(totalText(container)).toContain('13.00');
  toggle.click();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r));
  expect(hidden()).toBe(0);
  expect(toggle.textContent?.trim()).toBe('Show fewer');
  cleanup();
  const { container: short } = render(InvoiceLines, { props: { lines: lines.slice(0, 12) } });
  expect(short.querySelector('.ril-toggle')).toBeNull();
});
