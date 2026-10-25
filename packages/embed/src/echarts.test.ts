// src/echarts.test.ts: the embed's echarts subset (echarts.ts) must register
// every series type the Chart widget draws, or that chart renders blank in the
// embed only. Reads Chart.svelte's `type: '<series>'` literals.
import { expect, it } from 'vitest';
import src from '../../svelte/src/lib/widgets/data/Chart.svelte?raw';
import { SERIES } from './echarts.js';

it('registers every series type Chart.svelte uses', () => {
	const used = new Set([...src.matchAll(/type:\s*'([a-z]+)'/g)].map((m) => m[1]));
	for (const notSeries of ['category', 'value', 'linear', 'time', 'log']) used.delete(notSeries);
	expect([...used].filter((t) => !SERIES.includes(t))).toEqual([]);
});
