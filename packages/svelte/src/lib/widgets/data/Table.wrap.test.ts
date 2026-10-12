// widgets/data/Table.wrap.test.ts: long text cells wrap instead of clipping
// mid-word (live chip audit, review NDA), and numeric columns stay
// right-aligned on one line so the figures line up.
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import Table from './Table.svelte';
import { reviewNda } from '../__fixtures__/live-chip-specs.js';

afterEach(cleanup);

const cellOf = (text: string) => screen.getByText(text, { exact: false }).closest('td')!;

test('review-nda spec: a sentence-long cell wraps, never nowrap or truncate', () => {
  render(Ripple, { props: { spec: reviewNda } });
  const td = cellOf('Check whether it covers only marked');
  expect(td.className).toContain('whitespace-normal');
  expect(td.className).toContain('align-top');
  expect(td.className).not.toMatch(/whitespace-nowrap|truncate|text-ellipsis/);
});

test('a numeric column is right-aligned and unwrapped, header included', () => {
  render(Table, {
    props: {
      columns: [{ header: 'Item', accessorKey: 'item' }, { header: 'Amount', accessorKey: 'amount' }],
      rows: [{ item: 'Rent', amount: 1200 }, { item: 'Food', amount: 340.5 }],
    },
  });
  const td = cellOf('1200');
  expect(td.className).toContain('text-right');
  expect(td.className).toContain('whitespace-nowrap');
  expect(screen.getByText('Amount').closest('th')!.className).toContain('text-right');
  expect(cellOf('Rent').className).not.toContain('text-right');
});
