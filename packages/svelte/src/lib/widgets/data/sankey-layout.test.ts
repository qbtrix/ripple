// sankey-layout.test.ts: the pure sankey rules (sanitize, figures, summary,
// readouts, footnote, prop parsing, label placement) on the worst-case specs.
import { describe, expect, test } from 'vitest';
import {
	sanitize,
	stats,
	summary,
	footnote,
	layout,
	nodeReadout,
	nodeName,
	linkReadout,
	restReadout,
	nodeFigure,
	parseHeight,
	parseCurve,
	guess,
	fmt,
	H1,
	type Graph,
	type Measure
} from './sankey-layout.js';

import { num } from '../data-kit/format.js';
import { n, SPEC01, SPEC02, SPEC03, SPEC04, SPEC05, SPEC06 } from './__fixtures__/sankey-specs.js';

const SPEC07 = {
	nodes: [],
	links: [{ source: 'Trial', target: 'Paid', value: 37 }]
};

const prep = (s: { nodes: unknown; links: unknown }) => {
	const g = sanitize(s.nodes, s.links);
	return { g, st: stats(g) };
};
const names = (g: Graph) => g.nodes.map((x) => x.name);
const flow = (g: Graph, s: string, t: string) => g.links.find((l) => g.nodes[l.s].name === s && g.nodes[l.t].name === t)?.value;

describe('summary', () => {
	test('spec 01: one start, the largest end is a remainder', () => {
		const { g, st } = prep(SPEC01);
		expect(summary(g, st)).toBe('120 from Landing · most end at Active (70, 58%)');
	});
	test('spec 02: several sources', () => {
		const { g, st } = prep(SPEC02);
		expect(summary(g, st)).toBe('1,655 from 5 sources · most end at Resolved (1,190, 72%)');
	});
	test('spec 07: one end only', () => {
		const { g, st } = prep(SPEC07);
		expect(summary(g, st)).toBe('37 from Trial · all end at Paid');
	});
});

describe('remainders', () => {
	test('spec 01: Signup 35 and Active 70 stop', () => {
		const { g, st } = prep(SPEC01);
		expect(st.rem).toEqual([0, 35, 70, 0]);
		expect(nodeReadout(g, st, 1)).toBe('Signup · 120 in · 85 out · 35 stop here');
		expect(nodeName(g, st, 1)).toBe('Signup, 120 in, 85 out, 35 stop here');
		expect(nodeFigure(st, 0)).toBe('120');
		expect(nodeFigure(st, 2)).toBe('85 · 71%');
	});
	test('spec 06: stubs at API and Store only (0.5% of the total, and at least 1)', () => {
		const { g, st } = prep(SPEC06);
		const stops = Object.fromEntries(g.nodes.flatMap((x, i) => (st.rem[i] ? [[x.name, st.rem[i]]] : [])));
		expect(stops).toEqual({ API: 997, Store: 1000 });
		expect(nodeFigure(st, names(g).indexOf('Dropped'))).toBe('1 · <1%');
		expect(nodeFigure(st, names(g).indexOf('Done'))).toBe('95.5K · 96%');
	});
	test('readouts: rest shows the largest band, a band its share of the source', () => {
		const { g, st } = prep(SPEC01);
		expect(restReadout(g, st)).toBe('Largest flow: Landing → Signup, 120 (100% of Landing)');
		expect(linkReadout(g, st, 1)).toBe('Signup → Active · 85 · 71% of Signup');
	});
});

describe('spec 04: messy data degrades visibly', () => {
	const { g, st } = prep(SPEC04);
	test('index link plus repeated pair, numeric strings, implicit node, merged duplicate', () => {
		expect(flow(g, 'Visit', 'Search')).toBe(1000);
		expect(flow(g, 'Visit', 'Cart')).toBe(1200);
		expect(flow(g, 'Search', 'Cart')).toBe(640);
		expect(flow(g, 'Search', 'Wishlist')).toBe(120);
		expect(names(g).filter((x) => x === 'Cart')).toHaveLength(1);
		expect(names(g)).toEqual(['Visit', 'Search', 'Cart', 'Checkout', 'Paid', 'Wishlist', 'Receipt']);
	});
	test('self-link and back-link are not drawn; out above in has no stub', () => {
		expect(flow(g, 'Cart', 'Cart')).toBeUndefined();
		expect(flow(g, 'Checkout', 'Cart')).toBeUndefined();
		const paid = names(g).indexOf('Paid');
		expect(st.value[paid]).toBe(1300);
		expect(st.rem[paid]).toBe(0);
		expect(nodeReadout(g, st, paid)).toBe('Paid · 1,100 in · 1,300 out');
	});
	test('the footnote counts every drop and names the unlinked nodes', () => {
		expect(g.dropped).toEqual({ value: 4, loop: 2, end: 1 });
		expect(footnote(g)).toBe('7 flows not drawn: 4 without a value, 2 looping back, 1 missing an end · Not linked: Orphan, Promo');
	});
	test('layout never throws and nothing reads NaN or undefined', () => {
		for (const width of [328, 680]) {
			const l = layout(g, st, {
				width,
				maxH: parseHeight('tall'),
				vertical: width < 480,
				curve: parseCurve(3)
			});
			const text = JSON.stringify(l);
			expect(text).not.toMatch(/NaN|undefined|null/);
		}
	});
});

describe('sanitize', () => {
	test('cycles break in input order', () => {
		const g = sanitize(n('A', 'B', 'C'), [
			{ source: 'A', target: 'B', value: 1 },
			{ source: 'B', target: 'C', value: 1 },
			{ source: 'C', target: 'A', value: 1 },
			{ source: 'A', target: 'C', value: 1 }
		]);
		expect(g.links.map((l) => `${g.nodes[l.s].name}${g.nodes[l.t].name}`)).toEqual(['AB', 'BC', 'AC']);
		expect(g.dropped.loop).toBe(1);
	});
	test('index endpoints read the raw array; a numeric name wins over an index', () => {
		const g = sanitize(
			[{ name: '' }, 'B', '0'],
			[
				{ source: 1, target: 2, value: 5 },
				{ source: 0, target: 'C', value: 4 },
				{ source: 7, target: 'B', value: 1 }
			]
		);
		expect(names(g)).toEqual(['B', '0', 'C']);
		expect(flow(g, 'B', '0')).toBe(5);
		expect(flow(g, '0', 'C')).toBe(4);
		expect(g.dropped.end).toBe(1);
	});
	test('implicit nodes and case-insensitive matching', () => {
		const g = sanitize(n('Start'), [{ source: 'start', target: 'End', value: 3 }]);
		expect(names(g)).toEqual(['Start', 'End']);
	});
	test('empty input draws nothing and never throws', () => {
		for (const [nodes, links] of [
			[undefined, undefined],
			['x', 5],
			[[], []],
			[n('Lone'), []]
		]) {
			const g = sanitize(nodes, links);
			const st = stats(g);
			expect(g.links).toEqual([]);
			expect(summary(g, st)).toBe('');
			expect(layout(g, st, { width: 300, maxH: 320, vertical: true, curve: 0.5 }).nodes).toEqual([]);
		}
		expect(footnote(sanitize(n('Lone'), []))).toBe('Not linked: Lone');
	});
});

describe('props', () => {
	test('height is a clamped maximum; junk uses 320', () => {
		expect(parseHeight(undefined)).toBe(320);
		expect(parseHeight('tall')).toBe(320);
		expect(parseHeight('360')).toBe(360);
		expect(parseHeight(40)).toBe(160);
		expect(parseHeight(5000)).toBe(720);
	});
	test('curveness clamps to 0-1, junk uses 0.5', () => {
		expect(parseCurve(3)).toBe(1);
		expect(parseCurve(-1)).toBe(0);
		expect(parseCurve('x')).toBe(0.5);
		expect(parseCurve(undefined)).toBe(0.5);
	});
	test('curveness 0 draws straight bands, 1 full S-curves', () => {
		const { g, st } = prep(SPEC01);
		const straight = layout(g, st, {
			width: 680,
			maxH: 320,
			vertical: false,
			curve: 0
		}).links[0].d;
		// Control points sit on the end points: the first cubic starts where it begins.
		const [m0, c0] = straight.match(/M([\d.,]+)C([\d.,]+)/)!.slice(1);
		expect(c0).toBe(m0);
		const s = layout(g, st, {
			width: 680,
			maxH: 320,
			vertical: false,
			curve: 1
		}).links[1].d;
		const [mx] = s
			.match(/M([\d.]+)/)!
			.slice(1)
			.map(Number);
		const [cx] = s
			.match(/C([\d.]+)/)!
			.slice(1)
			.map(Number);
		expect(cx).toBeGreaterThan(mx + 100);
	});
});

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const shown = (l: ReturnType<typeof layout>) => l.labels.filter((x) => x.lines > 0);

describe('layout', () => {
	const noOverlap = (l: ReturnType<typeof layout>) => {
		const s = shown(l);
		for (let a = 0; a < s.length; a++)
			for (let b = a + 1; b < s.length; b++) expect(overlaps(s[a], s[b]), `${s[a].key} ${s[b].key}`).toBe(false);
	};

	test('spec 01 wide: every node and both remainders labelled, inside the plot', () => {
		const { g, st } = prep(SPEC01);
		const l = layout(g, st, {
			width: 680,
			maxH: 320,
			vertical: false,
			curve: 0.5
		});
		expect(l.H).toBe(160);
		expect(shown(l).filter((x) => x.kind === 'node')).toHaveLength(4);
		expect(l.labels.filter((x) => x.kind === 'stub').map((x) => x.text)).toEqual(['35 stop here', '70 stop here']);
		for (const x of shown(l)) expect(x.x >= 0 && x.x + x.w <= 680 && x.y >= 0 && x.y + x.h <= l.H).toBe(true);
		noOverlap(l);
	});
	test('spec 01 narrow: rows top to bottom, labels under their bars', () => {
		const { g, st } = prep(SPEC01);
		const l = layout(g, st, {
			width: 328,
			maxH: 320,
			vertical: true,
			curve: 0.5
		});
		const ys = l.nodes.map((x) => x.y);
		expect(ys).toEqual(ys.toSorted((a, b) => a - b));
		expect(ys[1] - ys[0]).toBe(72);
		for (const lb of shown(l).filter((x) => x.kind === 'node')) expect(lb.y).toBeGreaterThan(l.nodes[lb.i].y);
		expect(l.labels.find((x) => x.kind === 'stub' && x.i === 1)?.text).toBe('35 stop');
		noOverlap(l);
	});
	test('spec 02 wide fits 320 without overlap; start nodes stay', () => {
		const { g, st } = prep(SPEC02);
		const l = layout(g, st, {
			width: 680,
			maxH: 320,
			vertical: false,
			curve: 0.5
		});
		expect(l.H).toBeLessThanOrEqual(320);
		noOverlap(l);
		for (const i of st.starts) expect(l.labels.find((x) => x.key === `n${i}`)!.lines).toBeGreaterThan(0);
	});
	test('spec 02 narrow: no overlap; the roomy sources keep their labels', () => {
		const { g, st } = prep(SPEC02);
		const l = layout(g, st, {
			width: 328,
			maxH: 320,
			vertical: true,
			curve: 0.5
		});
		noOverlap(l);
		for (const name of ['Email', 'Chat', 'Triage', 'Resolved']) expect(l.labels.find((x) => x.text === name)!.lines, name).toBe(2);
	});
	test('spec 06: 160px wide; narrow pitch floors at 56px; 1px bands and 2px nodes', () => {
		const { g, st } = prep(SPEC06);
		const wide = layout(g, st, {
			width: 680,
			maxH: 200,
			vertical: false,
			curve: 1
		});
		expect(wide.H).toBe(160);
		noOverlap(wide);
		const dropped = wide.nodes[names(g).indexOf('Dropped')];
		expect(dropped.h).toBe(2);
		const narrow = layout(g, st, {
			width: 328,
			maxH: 200,
			vertical: true,
			curve: 1
		});
		const rows = [...new Set(narrow.nodes.map((x) => x.y))].toSorted((a, b) => a - b);
		expect(rows).toHaveLength(8);
		expect(rows[1] - rows[0]).toBe(56);
		expect(narrow.H).toBeGreaterThan(200);
		noOverlap(narrow);
		expect(narrow.nodes).toHaveLength(14);
		// A narrow bar is at least 6px long, inside the plot.
		for (const x of narrow.nodes) expect(x.w >= 6 && x.x >= 0 && x.x + x.w <= 328.01).toBe(true);
	});
	test('a one-letter start still gets a gutter wide enough for its label', () => {
		const { g, st } = prep({
			nodes: [],
			links: [{ source: 'a', target: 'b', value: 1 }]
		});
		const l = layout(g, st, {
			width: 640,
			maxH: 320,
			vertical: false,
			curve: 0.5
		});
		expect(l.labels.filter((x) => x.kind === 'node').map((x) => x.fig)).toEqual(['1', '1 · 100%']);
	});
	test('spec 07: implicit nodes, a short plot', () => {
		const { g, st } = prep(SPEC07);
		expect(names(g)).toEqual(['Trial', 'Paid']);
		expect(layout(g, st, { width: 680, maxH: 320, vertical: false, curve: 0.5 }).H).toBe(160);
	});
});

// Placement rules under real-ish type widths. The browser's widths differ
// from `guess`, so every rule runs at a narrower and a wider face.
const FACES: [string, Measure][] = [
	['guess', guess],
	['narrow face', (t, b) => guess(t, b) * 0.85],
	['wide face', (t, b) => guess(t, b) * 1.2]
];
// Plot widths of a 360 and a 720 card (with and without the card's padding).
const NARROW = [290, 328];
const WIDE = [591, 680];
type Spec = { nodes: unknown; links: unknown };
const run = (s: Spec, width: number, measure: Measure, o: { vertical?: boolean; maxH?: number } = {}) => {
	const { g, st } = prep(s);
	return {
		g,
		st,
		l: layout(g, st, {
			width,
			maxH: o.maxH ?? 320,
			vertical: !!o.vertical || width < 480,
			curve: 0.5,
			measure
		})
	};
};
const ALL: [string, Spec, { vertical?: boolean; maxH?: number }][] = [
	['01', SPEC01, {}],
	['02', SPEC02, {}],
	['03', SPEC03, {}],
	['04', SPEC04, {}],
	['05', SPEC05, { vertical: true, maxH: 360 }],
	['06', SPEC06, { maxH: 200 }]
];
const HORIZONTAL = ALL.filter(([, , o]) => !o.vertical);
const nodeLabels = (l: ReturnType<typeof layout>) => shown(l).filter((x) => x.kind === 'node');

describe('label placement', () => {
	describe.each(FACES)('%s', (face, measure) => {
		// Content checks (whole figures, full short names) at a 720 card; the wide
		// face, 20% wider than the real type, only at the roomier plot width.
		const CONTENT = face === 'wide face' ? [680] : WIDE;
		test('spec 01 shows both remainders at every width; wide keeps the word', () => {
			for (const width of [...NARROW, ...WIDE]) {
				const { l } = run(SPEC01, width, measure);
				const tips = l.labels.filter((x) => x.kind === 'stub');
				expect(
					tips.map((x) => x.lines),
					`${width}`
				).toEqual([1, 1]);
				for (const x of tips) expect(x.text, `${width}`).toMatch(width >= 480 ? / stop here$/ : / stop$/);
			}
		});
		test('a remainder figure sits at its own stub: beside its free end, or under, over or on it', () => {
			for (const [name, spec, o] of ALL)
				for (const width of [...NARROW, ...WIDE]) {
					const { l } = run(spec, width, measure, o);
					for (const s of l.stubs) {
						const tip = l.labels.find((x) => x.key === `s${s.i}`)!;
						if (!tip.lines) continue;
						const at = `${name} at ${width}: stub ${s.i}`;
						const bar = l.nodes[s.i];
						if (l.vertical) {
							// Beside the stub, or across its middle (never on the band beside it).
							const cx = s.box.x + s.box.w / 2;
							expect(tip.x >= s.box.x + s.box.w || (tip.x <= cx && cx <= tip.x + tip.w), at).toBe(true);
							expect(tip.y, at).toBeGreaterThanOrEqual(bar.y + bar.h - H1);
						} else {
							expect(tip.x >= s.box.x && tip.x <= s.box.x + s.box.w + 4.01, at).toBe(true);
							expect(tip.y <= s.box.y + s.box.h + 2.01 && s.box.y - 2.01 <= tip.y + tip.h, at).toBe(true);
						}
					}
				}
		});
		test('remainder figures are protected: every stub shows its figure at a 720 card', () => {
			const want: [string, Spec, { vertical?: boolean; maxH?: number }, string[]][] = [
				['01', SPEC01, {}, ['35', '70']],
				['03', SPEC03, {}, ['55K', '91K']],
				['04', SPEC04, {}, ['240']],
				['05', SPEC05, { vertical: true, maxH: 360 }, ['105', '6']],
				['06', SPEC06, { maxH: 200 }, ['997', '1,000']]
			];
			for (const [name, spec, o, figs] of want)
				for (const width of CONTENT) {
					const { l } = run(spec, width, measure, o);
					const tips = l.labels.filter((x) => x.kind === 'stub');
					for (const x of tips) expect(x.lines, `${name} at ${width}: ${x.key}`).toBe(1);
					for (const f of figs)
						expect(
							tips.map((x) => x.fig),
							`${name} at ${width}`
						).toContain(f);
					for (const x of tips) expect(x.text.startsWith(x.fig), `${name} at ${width}`).toBe(true);
				}
		});
		test('nothing overlaps; wide, protected labels (starts, the largest end, over 15%) are never hidden', () => {
			for (const [name, spec, o] of ALL)
				for (const width of [...NARROW, ...WIDE]) {
					const { st, l } = run(spec, width, measure, o);
					// Narrow, a start keeps its label whenever its own slot can hold a figure.
					for (const i of st.starts)
						if (!l.vertical || name === '01' || name === '03')
							expect(l.labels.find((x) => x.key === `n${i}`)!.lines, `${name} at ${width}: start n${i}`).toBeGreaterThan(0);
					if (!l.vertical) {
						const kept = l.nodes.map((q) => q.i).filter((i) => st.inn[i] === 0 || i === st.largestEnd || st.value[i] > 0.15 * st.total);
						for (const i of kept) expect(l.labels.find((x) => x.key === `n${i}`)!.lines, `${name} at ${width}: n${i}`).toBeGreaterThan(0);
					}
					const s = shown(l);
					for (let a = 0; a < s.length; a++)
						for (let b = a + 1; b < s.length; b++) expect(overlaps(s[a], s[b]), `${name} at ${width}: ${s[a].key} ${s[b].key}`).toBe(false);
				}
		});
		test('spec 05: Offer and Hired are labelled at both widths', () => {
			for (const width of [328, 680]) {
				const { g, l } = run(SPEC05, width, measure, {
					vertical: true,
					maxH: 360
				});
				for (const name of ['Offer', 'Hired']) {
					const i = names(g).indexOf(name);
					expect(l.labels.find((x) => x.key === `n${i}`)!.lines, `${name} at ${width}`).toBeGreaterThan(0);
				}
			}
		});
		test('wide: each label ends just before its own bar, and labels of different ranks never share x', () => {
			for (const [name, spec, o] of HORIZONTAL)
				for (const width of WIDE) {
					const { l } = run(spec, width, measure, o);
					const s = nodeLabels(l);
					for (const a of s) {
						const bar = l.nodes[a.i];
						expect(bar.x - (a.x + a.w), `${name} at ${width}: ${a.key}`).toBeCloseTo(3, 5);
						const mid = bar.y + bar.h / 2;
						expect(a.y <= mid + 1 && mid - 1 <= a.y + a.h, `${name} at ${width}: ${a.key} spans its bar's middle`).toBe(true);
						for (const b of s)
							if (l.nodes[b.i].x !== bar.x)
								expect(a.x < b.x + b.w && b.x < a.x + a.w, `${name} at ${width}: ${a.key} ${b.key}`).toBe(false);
					}
				}
		});
		test('narrow: each label sits under its own bar and never under another bar of its row', () => {
			for (const [name, spec, o] of ALL)
				for (const width of NARROW) {
					const { l } = run(spec, width, measure, o);
					for (const a of nodeLabels(l)) {
						const bar = l.nodes[a.i];
						const at = `${name} at ${width}: ${a.key}`;
						expect(a.y, at).toBeGreaterThan(bar.y);
						expect(a.x <= bar.x + 0.01 && bar.x < a.x + a.w, at).toBe(true);
						for (const q of l.nodes)
							if (q !== bar && q.y === bar.y) expect(a.x < q.x + q.w && q.x < a.x + a.w, `${at} under n${q.i}`).toBe(false);
					}
				}
		});
		test('every shown node label carries its figure on one line; spec 03 wide keeps every percent', () => {
			for (const [name, spec, o] of ALL)
				for (const width of [...NARROW, ...WIDE]) {
					const { st, l } = run(spec, width, measure, o);
					for (const a of nodeLabels(l)) {
						const v = st.value[a.i];
						expect([nodeFigure(st, a.i), fmt(v), num(v, { compact: true })], `${name} at ${width}: ${a.key}`).toContain(a.fig);
						expect(a.lines, `${name} at ${width}: ${a.key}`).toBeLessThanOrEqual(2);
						// A name is never drawn without its figure; the figure alone is a protected label's last resort.
						if (!a.text)
							expect(st.inn[a.i] === 0 || a.i === st.largestEnd || v > 0.15 * st.total, `${name} at ${width}: ${a.key}`).toBe(true);
					}
				}
			for (const [name, spec, o] of [ALL[2]])
				for (const width of CONTENT) {
					const { st, l } = run(spec, width, measure, o);
					for (const a of nodeLabels(l).filter((x) => st.inn[x.i])) expect(a.fig, `${name} at ${width}: ${a.key}`).toMatch(/ · (<1|\d+)%$/);
				}
		});
		test('spec 04 wide draws Wishlist by name with its figure', () => {
			for (const width of CONTENT) {
				const { l } = run(SPEC04, width, measure);
				const w = l.labels.find((x) => x.text === 'Wishlist')!;
				expect(w.lines, `${width}`).toBeGreaterThanOrEqual(2);
				expect(['120 · 5%', '120']).toContain(w.fig);
				// Search's remainder figure (protected) may cut the name, never below its 6-character floor.
				expect(w.w - 12, `${width}: the name keeps its floor`).toBeGreaterThanOrEqual(measure('Wishl…', true) - 0.01);
			}
		});
	});
});
