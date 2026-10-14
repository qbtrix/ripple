// widgets/vertical/InvoiceLines.test.ts: invoice totals tolerate the prop
// names a model actually writes. Live chip audit (create invoice): the model
// wrote summary[].amount, the widget read summary[].value, the tax row read
// "USDNaN". amount/total are aliases, and a non-number shows "—", never NaN.
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
