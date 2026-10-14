// widgets/data/calendar-layout.test.ts: the calendar's pure half. The opening
// period's five rungs in both views, weeks to draw, span segments and lanes,
// the agenda, model-data hygiene (colours, swapped and impossible dates,
// undated events, bad locale, the cap), and measured colour contrast of the
// chip ink, chip edge and dot against the Ripple site's cards in both themes.
import { describe, expect, it } from 'vitest';
import {
	agenda,
	eventColor,
	fmt,
	isoOf,
	layoutWeek,
	MAX_EVENTS,
	nearest,
	openPeriod,
	parseEvents,
	rangeLabel,
	readDay,
	weeksOf,
	words
} from './calendar-layout.js';
import { PALETTE } from '../composite/week-schedule.js';
import { contrast, mix, oklch, toRgb, type Lab, type Rgb } from '../../ui/__fixtures__/contrast.js';

const D = (iso: string) => readDay(iso)!.day;
const TODAY = D('2026-10-14');
const ev = (start: string, end?: string, extra: Record<string, unknown> = {}) => ({ id: start + (end ?? ''), title: 't', start, end, ...extra });
const open = (raw: unknown[], view: 'month' | 'week', value: unknown = null) => isoOf(openPeriod(parseEvents(raw).events, value, view, TODAY));

describe('openPeriod', () => {
	it('rung 1: a valid value wins', () => {
		expect(open([ev('2026-05-05')], 'month', '2026-11-10')).toBe('2026-11-01');
		expect(open([ev('2026-05-05')], 'week', '2026-11-10')).toBe('2026-11-08');
	});
	it('ignores an unparseable value', () => {
		expect(open([ev('2027-03-02')], 'month', 'not a date')).toBe('2027-03-01');
	});
	it("rung 2: today's period when it has an event, spans included", () => {
		expect(open([ev('2026-10-02'), ev('2027-01-01')], 'month')).toBe('2026-10-01');
		expect(open([ev('2026-09-01', '2026-11-30'), ev('2027-01-01')], 'week')).toBe('2026-10-11');
	});
	it('rung 3: the earliest event on or after today', () => {
		expect(open([ev('2027-02-01'), ev('2026-12-03'), ev('2026-01-01')], 'month')).toBe('2026-12-01');
		expect(open([ev('2026-12-03')], 'week')).toBe('2026-11-29');
	});
	it('rung 4: the latest event when all are past', () => {
		expect(open([ev('2026-05-05'), ev('2026-05-19'), ev('2026-03-01')], 'month')).toBe('2026-05-01');
		expect(open([ev('2026-05-05'), ev('2026-05-19')], 'week')).toBe('2026-05-17');
	});
	it('rung 5: today with no events', () => {
		expect(open([], 'month')).toBe('2026-10-01');
		expect(open([], 'week')).toBe('2026-10-11');
	});
});

describe('weeksOf', () => {
	it('draws only the weeks a month touches', () => {
		expect(weeksOf(D('2026-02-01'), 'month')).toHaveLength(4);
		expect(weeksOf(D('2026-05-01'), 'month')).toHaveLength(6);
		expect(weeksOf(D('2026-10-01'), 'month')).toHaveLength(5);
		expect(weeksOf(D('2026-10-14'), 'week').map(isoOf)).toEqual(['2026-10-11']);
	});
});

describe('layoutWeek', () => {
	it('cuts a span into one segment per week with squared ends', () => {
		const { events } = parseEvents([ev('2026-10-28', '2026-11-03')]);
		const a = layoutWeek(events, D('2026-10-25')).segments[0];
		const b = layoutWeek(events, D('2026-11-01')).segments[0];
		expect([a.col, a.span, a.before, a.after]).toEqual([3, 4, false, true]);
		expect([b.col, b.span, b.before, b.after]).toEqual([0, 3, true, false]);
	});
	it('keeps lanes steady, longest first, and hides past the cap', () => {
		const { events } = parseEvents([
			ev('2026-10-20', '2026-10-23'),
			ev('2026-10-19', '2026-10-21'),
			ev('2026-10-21', '2026-10-22'),
			ev('2026-10-24')
		]);
		const L = layoutWeek(events, D('2026-10-18'));
		const lane = (s: string) => L.segments.find((x) => isoOf(x.ev.start) === s)!.lane;
		expect(lane('2026-10-20')).toBe(0);
		expect(lane('2026-10-19')).toBe(1);
		expect(lane('2026-10-21')).toBe(2);
		expect(lane('2026-10-24')).toBe(0);
		const capped = layoutWeek(events, D('2026-10-18'), 2);
		expect(capped.lanes).toBe(2);
		expect(capped.more).toEqual([0, 0, 0, 1, 1, 0, 0]);
		expect(capped.days[3]).toHaveLength(3);
	});
	it('drops a short event into a free lower lane beside a longer span', () => {
		const { events } = parseEvents([ev('2026-10-07', '2026-10-09'), ev('2026-10-05')]);
		const L = layoutWeek(events, D('2026-10-04'));
		expect(L.segments.map((s) => s.lane)).toEqual([0, 0]);
		expect(L.lanes).toBe(1);
	});
	it('an 8-event day shows 3 lanes and 5 more', () => {
		const { events } = parseEvents(Array.from({ length: 8 }, (_, i) => ev(`2026-10-14T0${i}:00:00`)));
		const L = layoutWeek(events, D('2026-10-11'), 3);
		expect(L.segments).toHaveLength(3);
		expect(L.more[3]).toBe(5);
	});
});

describe('agenda', () => {
	it('lists a span once under its first visible day, all-day before timed', () => {
		const { events } = parseEvents([ev('2026-10-14T09:00'), ev('2026-10-14'), ev('2026-09-20', '2026-10-03')]);
		const g = agenda(events, D('2026-10-01'), D('2026-10-31'));
		expect(g.map((x) => isoOf(x.day))).toEqual(['2026-10-01', '2026-10-14']);
		expect(g[1].events.map((e) => e.time ?? 'all')).toEqual(['all', '9:00']);
	});
	it('week view keeps every day and notes a continuing span', () => {
		const { events } = parseEvents([ev('2026-09-01', '2026-11-30')]);
		const g = agenda(events, D('2026-10-11'), D('2026-10-17'), true);
		expect(g).toHaveLength(7);
		expect(g[0].events).toHaveLength(1);
		expect(g[4].events).toHaveLength(0);
		expect(g[4].continuing).toHaveLength(1);
	});
	it('nearest points to the next event, else the last', () => {
		const { events } = parseEvents([ev('2026-05-05'), ev('2026-07-03')]);
		expect(isoOf(nearest(events, D('2026-06-01'), D('2026-06-30'))!.ev.start)).toBe('2026-07-03');
		expect(nearest(events, D('2026-08-01'), D('2026-08-31'))!.dir).toBe('last');
	});
});

describe('model data hygiene', () => {
	const raw = [
		{ id: 1, title: '**Kickoff** with the new team', start: '2027-03-02', color: 'purple' },
		{ id: 2, title: 'Team offsite', start: 'next Tuesday' },
		{ id: 3, title: 'Vendor review', start: '2027-03-12', end: '2027-03-09', color: '#0a0' },
		{ id: 4, title: '', start: '2027-03-15' },
		{ id: 'dup', title: 'A', start: '2027-03-18', color: 'red; background:url(x)' },
		{ id: 'dup', title: 'B', start: '2027-03-18', color: 'rgb(10, 20, 30)' },
		{ id: 8, title: 'Impossible day', start: '2027-02-31' },
		{ id: 9, title: 'Interview loop', start: '2027-03-23T13:45:00Z', color: '#3B82F6' },
		null,
		'junk'
	];
	const p = parseEvents(raw);
	it('keeps undated and impossible days out of the grid but listed', () => {
		expect(p.undated.map((u) => u.title)).toEqual(['Team offsite', 'Impossible day', '', '']);
	});
	it('swaps a reversed span, strips markdown, keeps empty titles and both duplicates', () => {
		const vr = p.events.find((e) => e.title === 'Vendor review')!;
		expect([isoOf(vr.start), isoOf(vr.end)]).toEqual(['2027-03-09', '2027-03-12']);
		expect(p.events[0].title).toBe('Kickoff with the new team');
		expect(p.events.some((e) => e.title === '')).toBe(true);
		const dups = p.events.filter((e) => e.title === 'A' || e.title === 'B');
		expect(new Set(dups.map((e) => e.key)).size).toBe(2);
		expect(dups[0].raw).toBe(raw[4]);
	});
	it('reads time from the digits, never shifted', () => {
		expect(p.events.find((e) => e.title === 'Interview loop')!.time).toBe('13:45');
	});
	it('accepts hex and palette names only', () => {
		expect(eventColor('#0a0', 'x')).toBe('#0a0');
		expect(eventColor('#3B82F6', 'x')).toBe('#3b82f6');
		expect(eventColor('purple', 'x')).toBe(PALETTE.purple);
		for (const bad of ['red; background:url(x)', 'rgb(10, 20, 30)', 'not-a-colour', undefined, 42, '#12345'])
			expect(Object.values(PALETTE)).toContain(eventColor(bad, 'Title'));
	});
	it('survives a bad locale', () => {
		expect(() => fmt('xx_bad!', { month: 'long' })(D('2027-03-01'))).not.toThrow();
		expect(rangeLabel(D('2026-05-20'), D('2026-05-22'), 'xx_bad!')).toMatch(/20.*22/);
	});
	it('formats ranges in the locale, not with an English joiner', () => {
		expect(rangeLabel(D('2026-05-20'), D('2026-05-22'), 'en-US')).toMatch(/^May 20\s*\u2013\s*22$/);
		expect(rangeLabel(D('2026-10-28'), D('2026-11-03'), 'en-US')).toMatch(/^Oct 28\s*\u2013\s*Nov 3$/);
		expect(rangeLabel(D('2026-10-11'), D('2026-10-17'), 'en-US', true)).toMatch(/^Oct 11\s*\u2013\s*17, 2026$/);
		const de = rangeLabel(D('2026-11-16'), D('2026-11-19'), 'de-DE');
		expect(de).toMatch(/^16\.\s*\u2013\s*19\. Nov\.$/);
		expect(rangeLabel(D('2026-10-28'), D('2026-11-04'), 'de-DE')).toMatch(/^28\. Okt\.\s*\u2013\s*4\. Nov\.$/);
		expect(de).not.toMatch(/ to /);
		expect(rangeLabel(D('2026-05-20'), D('2026-05-20'), 'en-US')).toBe('May 20');
	});
	it('falls back to "to" when formatRange is missing', () => {
		const orig = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'formatRange')!;
		// @ts-expect-error simulate an old runtime
		delete Intl.DateTimeFormat.prototype.formatRange;
		try {
			expect(rangeLabel(D('2026-05-20'), D('2026-05-22'), 'en-US')).toBe('May 20 to 22');
			expect(rangeLabel(D('2026-10-28'), D('2026-11-03'), 'en-US', true)).toBe('Oct 28 to Nov 3, 2026');
		} finally {
			Object.defineProperty(Intl.DateTimeFormat.prototype, 'formatRange', orig);
		}
	});
	it('caps at MAX_EVENTS and survives junk', () => {
		const many = parseEvents(Array.from({ length: MAX_EVENTS + 5 }, (_, i) => ev('2026-10-01', undefined, { id: i })));
		expect(many.events).toHaveLength(MAX_EVENTS);
		expect(many.capped).toBe(true);
		expect(parseEvents(undefined).events).toEqual([]);
		expect(parseEvents({ a: 1 }).events).toEqual([]);
	});
});

// ── Measured contrast (rubric 4) ───────────────────────────────────────────
function hexLab(hex: string): Lab {
	let h = hex.slice(1);
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const lin = [0, 2, 4].map((i) => {
		const v = parseInt(h.slice(i, i + 2), 16) / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	const [r, g, b] = lin;
	const l = Math.cbrt(0.4122214708 * r + 0.5363329296 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

// The Ripple site's cards (routes/site.css) and the library defaults (styles.css).
// `tint` is the chip's --cal-tint in that theme (16% light, 26% dark).
const CARDS: Record<string, { surface: Lab; ink: Lab; tint: number }> = {
	'site light': { surface: hexLab('#efeee8'), ink: oklch(0.2, 0.01, 95), tint: 0.16 },
	'site dark': { surface: hexLab('#1d1d1a'), ink: oklch(0.95, 0.005, 260), tint: 0.26 },
	'site light page': { surface: hexLab('#f7f6f2'), ink: oklch(0.2, 0.01, 95), tint: 0.16 },
	'site dark page': { surface: hexLab('#262621'), ink: oklch(0.95, 0.005, 260), tint: 0.26 },
	'lib light': { surface: hexLab('#ffffff'), ink: hexLab('#0a0a0a'), tint: 0.16 },
	'lib dark': { surface: hexLab('#0a0a0a'), ink: hexLab('#fafafa'), tint: 0.26 }
};
const COLOURS = [...Object.values(PALETTE), '#0a0', '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];

describe('event colour contrast', () => {
	// The chip's time figures use the same ink as its title (no opacity, no
	// muted token), so this one measurement covers both.
	it('chip ink (title and time) 4.5:1 on its tint; edge and dot 3:1 on the card', () => {
		const fails: string[] = [];
		for (const [name, { surface, ink, tint: share }] of Object.entries(CARDS)) {
			const card: Rgb = toRgb(surface);
			for (const hex of COLOURS) {
				const ev = hexLab(hex);
				const tint = toRgb(mix(ev, surface, share));
				const text = toRgb(mix(ev, ink, 0.4));
				const mark = toRgb(mix(ev, ink, 0.7));
				const t = contrast(text, tint);
				const m = contrast(mark, card);
				if (t < 4.5) fails.push(`${name} ${hex} ink ${t.toFixed(2)}`);
				if (m < 3) fails.push(`${name} ${hex} mark ${m.toFixed(2)}`);
			}
		}
		expect(fails).toEqual([]);
	});
});

describe('words', () => {
	it('reads in the locale, English otherwise', () => {
		const de = words('de-DE');
		expect([de.today, de.count(1), de.count(7), de.allDay]).toEqual(['Heute', '1 Termin', '7 Termine', 'Ganztägig']);
		const en = words(undefined);
		expect([en.today, en.count(1), en.count(3), en.allDay]).toEqual(['Today', '1 event', '3 events', 'All day']);
		expect(words('xx_bad!').today).toBe('Today');
		// A language with no table row stays all English, never half translated.
		expect([words('ja').today, words('ja').count(2)]).toEqual(['Today', '2 events']);
	});
});
