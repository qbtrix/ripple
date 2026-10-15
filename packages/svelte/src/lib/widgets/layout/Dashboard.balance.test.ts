// Dashboard.balance.test.ts: the row balancing that keeps a dashboard from
// ending on one lone tile (5 tiles lay out 3+2, never 4+1).
import { describe, expect, it } from 'vitest';
import { balance } from './Dashboard.svelte';

describe('dashboard balance', () => {
	it('drops a column instead of leaving one tile alone', () => {
		expect(balance(4, 5)).toEqual({ cols: 3, spanLast: false });
		expect(balance(5, 5)).toEqual({ cols: 5, spanLast: false });
		expect(balance(4, 9)).toEqual({ cols: 3, spanLast: false });
		expect(balance(4, 10)).toEqual({ cols: 4, spanLast: false });
		expect(balance(3, 8)).toEqual({ cols: 3, spanLast: false });
		expect(balance(3, 7)).toEqual({ cols: 2, spanLast: true });
	});
	it('spans an odd last tile when only two columns fit', () => {
		expect(balance(2, 5)).toEqual({ cols: 2, spanLast: true });
		expect(balance(2, 3)).toEqual({ cols: 2, spanLast: true });
	});
	it('never asks for more columns than tiles, nor fewer than one', () => {
		expect(balance(6, 3)).toEqual({ cols: 3, spanLast: false });
		expect(balance(0, 4)).toEqual({ cols: 1, spanLast: false });
	});
});
