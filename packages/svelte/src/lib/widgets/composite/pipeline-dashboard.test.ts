// widgets/composite/pipeline-dashboard.test.ts: the pipeline-dashboard data
// rules (pipeline-dashboard.ts) on the brief's messy rows: currency map,
// compact amounts, target 0 or missing, the 99.5 percent rule, fraction
// rates, position ranking, cell text and dropped rows. Also pins the
// manifest example to the typical spec.
import { describe, expect, it } from 'vitest';
import {
	amount,
	cellText,
	funnelStages,
	moreLabel,
	pctLabel,
	ratePct,
	readCurrency,
	readDeals,
	readLeaders,
	readQuota,
	readRates,
	readTicker,
	usableFunnel
} from './pipeline-dashboard.js';
import { pipelineDashboardEntry } from '$lib/manifest/entries/pipeline-dashboard.js';

describe('currency and amounts', () => {
	it('maps symbols and codes, no dollar default', () => {
		expect(readCurrency('$')).toEqual({ code: 'USD' });
		expect(readCurrency('usd')).toEqual({ code: 'USD' });
		expect(readCurrency('€')).toEqual({ code: 'EUR' });
		expect(readCurrency('₩')).toEqual({ prefix: '₩' });
		expect(readCurrency(undefined)).toEqual({});
	});
	it('parses grouped strings with a leading symbol', () => {
		expect(amount('$1,200,000')).toBe(1_200_000);
		expect(amount('1,240')).toBe(1240);
		expect(amount('abc')).toBeUndefined();
		expect(amount(-5)).toBe(0);
	});
});

describe('readQuota', () => {
	it('spec 01: compact amounts, percent and what is left', () => {
		const q = readQuota({ label: 'Team quota', current: 1820000, target: 2500000, currency: '$', period: 'Q2, 28 days remaining' })!;
		expect(q).toMatchObject({ current: '$1.8M', target: '$2.5M', pctText: '73%', foot: '$680K to go', met: false });
	});
	it('spec 02: over target in EUR', () => {
		const q = readQuota({ current: 56200, target: 50000, currency: 'EUR' })!;
		expect(q).toMatchObject({ current: '€56.2K', target: '€50K', foot: '€6.2K over target', met: true, label: 'Target' });
	});
	it('spec 05: target 0 shows the amount alone', () => {
		const q = readQuota({ current: '$1,200,000', target: 0, currency: 'usd' })!;
		expect(q.current).toBe('$1.2M');
		expect(q.target).toBeUndefined();
		expect(q.pctText).toBeUndefined();
		expect(q.foot).toBeUndefined();
	});
	it('missing target and plain counts', () => {
		expect(readQuota({ current: 14 })!.target).toBeUndefined();
		expect(readQuota({ current: 14, target: 20 })).toMatchObject({ current: '14', target: '20', pctText: '70%', foot: '6 to go' });
		expect(readQuota({ current: 20, target: 20 })!.foot).toBe('Target reached');
		expect(readQuota({ target: 20 })).toBeUndefined();
		expect(readQuota('junk')).toBeUndefined();
	});
	it('never reads 100% before the target', () => {
		expect(pctLabel(99.6)).toBe('99%');
		expect(pctLabel(99.4)).toBe('99%');
		expect(pctLabel(72.8)).toBe('73%');
		expect(pctLabel(100)).toBe('100%');
	});
});

describe('readLeaders', () => {
	it('ranks by position when all have one, ties share a rank', () => {
		const r = readLeaders([
			{ name: 'B', position: 2 },
			{ name: 'A', position: 1 },
			{ name: 'C', position: 2 }
		]);
		expect(r.map((x) => [x.name, x.rank])).toEqual([['A', 1], ['B', 2], ['C', 2]]);
	});
	it('spec 05: one missing position ranks in input order', () => {
		const r = readLeaders(
			[
				{ name: 'Rhea Castellano', value: 420000, position: 2 },
				{ name: 'Odo Brandt', value: '$380k', position: 2 },
				{ name: '', value: '$310k', delta: '-$12k' },
				{ name: 'Lena Achterberg' },
				{ name: 'Pim Vos', value: '$90k', position: 1 }
			],
			{ code: 'USD' }
		);
		expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
		expect(r[0].value).toBe('$420K');
		expect(r[2]).toMatchObject({ name: '', delta: '-$12k', dir: 'down' });
		expect(r[3].value).toBeUndefined();
		expect(new Set(r.map((x) => x.key)).size).toBe(5);
	});
	it('handles junk', () => {
		expect(readLeaders(undefined)).toEqual([]);
		expect(readLeaders([null, 3, { name: 'X', value: 6 }])[0].value).toBe('6');
	});
});

describe('funnel and conversion', () => {
	it('a funnel needs two stages with numbers', () => {
		expect(usableFunnel(funnelStages({ stages: [{ value: '1,240' }, { value: 480 }] }))).toBe(true);
		expect(usableFunnel(funnelStages({ stages: [{ value: 3 }, { label: 'x' }] }))).toBe(false);
		expect(funnelStages({ stages: 'nope' })).toEqual([]);
	});
	it('spec 06: fraction and percent strings', () => {
		expect(ratePct(0.225)).toBeCloseTo(22.5);
		expect(ratePct('28.6%')).toBe(28.6);
		expect(ratePct(41)).toBe(41);
		expect(ratePct('x')).toBeUndefined();
		const r = readRates([
			{ from: 'Applied', to: 'Screened', rate: 0.225 },
			{ from: 'Screened', to: 'Onsite', rate: 41 },
			{ from: 'Onsite', to: 'Offer', rate: '28.6%' },
			{ from: 'Offer', rate: 'n/a' }
		]);
		expect(r.map((x) => x.text)).toEqual(['22.5%', '41%', '28.6%']);
		expect(r.map((x) => x.lowest)).toEqual([true, false, false]);
	});
});

describe('deals', () => {
	it('cell text from objects, arrays and null', () => {
		expect(cellText({ id: 3, label: 'Negotiation' })).toBe('Negotiation');
		expect(cellText(['call Tue', 'send MSA'])).toBe('call Tue, send MSA');
		expect(cellText(null)).toBe('');
		expect(cellText({ id: 3 })).toBe('');
		expect(cellText('**Tidewater** renewal')).toBe('Tidewater renewal');
		expect(cellText(48000)).toBe(48000);
	});
	it('spec 05: missing keys stay empty, empty rows drop, untitled rows say so', () => {
		const d = readDeals({
			columns: [{ key: 'name', label: 'Deal' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'stage', label: 'Stage' }],
			rows: [{ name: 'Fernhill Robotics pilot', value: '$84k', stage: 'Proposal' }, { amount: '$12k', stage: 'Qualified' }, {}]
		});
		expect(d.rows).toEqual([
			{ name: 'Fernhill Robotics pilot', amount: '', stage: 'Proposal' },
			{ name: 'Untitled', amount: '$12k', stage: 'Qualified' }
		]);
		expect(d.columns[1].align).toBe('right');
	});
	it('empty deals have no rows', () => {
		expect(readDeals({ columns: [], rows: [] }).rows).toEqual([]);
		expect(readDeals(undefined).columns).toEqual([]);
	});
});

describe('ticker and caps', () => {
	it('drops label-less rows and strips markdown', () => {
		const t = readTicker([{ label: '' }, { label: '- Proposal sent: **Mossbank Credit Union**', icon: 'file-text' }, null]);
		expect(t).toHaveLength(1);
		expect(t[0].label).toBe('Proposal sent: Mossbank Credit Union');
	});
	it('show-more labels', () => {
		expect(moreLabel(10, 5)).toBe('Show 5 more');
		expect(moreLabel(18, 5)).toBe('Show all 18');
		expect(moreLabel(8, 4, 'earlier')).toBe('Show 4 earlier');
	});
});

it('manifest example equals spec 01 (no em dashes)', () => {
	const ex = JSON.stringify(pipelineDashboardEntry.example);
	expect(ex).not.toContain('\u2014');
	expect(pipelineDashboardEntry.example!.props!.quota).toMatchObject({ period: 'Q2, 28 days remaining' });
});
