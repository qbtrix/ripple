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
  [...c.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(label))?.textContent ?? '';
const totalText = (c: HTMLElement) => c.querySelector('tfoot tr:last-child')?.textContent ?? '';

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
