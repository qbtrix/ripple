// audit-log-data.test.ts: the parsing, grouping and hygiene rules behind
// audit-log, with the shapes from the worst-case specs (zone-less, offset,
// impossible day, time-only, duplicate ids, junk items).
import { describe, expect, it } from 'vitest';
import {
	actorIconKey,
	dayHeading,
	effectiveGroupBy,
	facets,
	flag,
	groupEntries,
	humanizeKey,
	mixedZones,
	normalizeEntries,
	parseStamp,
	rowTime,
	summaryLine,
	toDetails,
	toSeverity,
	weekHeading,
	weekStart
} from './audit-log-data.js';

describe('parseStamp', () => {
	it.each([
		['2026-03-14T09:05:00Z', { day: '2026-03-14', time: '09:05', zone: 'UTC' }],
		['2026-03-14 23:50 +05:30', { day: '2026-03-14', time: '23:50', zone: 'UTC+05:30' }],
		['2026-03-14 23:50 -0400', { day: '2026-03-14', time: '23:50', zone: 'UTC-04:00' }],
		['2026-05-03 14:32 UTC', { day: '2026-05-03', time: '14:32', zone: 'UTC' }],
		['2026-05-03 14:32 GMT', { day: '2026-05-03', time: '14:32', zone: 'UTC' }],
		['2026-04-30 09:14', { day: '2026-04-30', time: '09:14' }],
		['2026-03-13', { day: '2026-03-13' }],
		['2026-03-13T02:00:00.123+00:00', { day: '2026-03-13', time: '02:00', zone: 'UTC' }]
	])('reads %s from its digits', (raw, want) => {
		expect(parseStamp(raw)).toEqual({ raw, ...want });
	});

	it.each(['2026-02-31 10:00', 'yesterday 4pm', '11:38', '2026-05-03 25:00', '', 'May 3'])('keeps %s raw', (raw) => {
		expect(parseStamp(raw)).toEqual({ raw });
	});

	it('treats a missing timestamp as empty', () => {
		expect(parseStamp(undefined)).toEqual({ raw: '' });
	});
});

describe('grouping', () => {
	const rows = normalizeEntries([
		{ id: 1, actor: 'A', action: 'x', timestamp: '2026-03-13 02:00 UTC' },
		{ id: 2, actor: 'B', action: 'y', timestamp: '2026-03-14 23:50 +05:30' },
		{ id: 3, actor: 'C', action: 'z', timestamp: 'yesterday 4pm' },
		{ id: 4, actor: 'D', action: 'w', timestamp: '2026-03-14T09:05:00Z' }
	]);

	it('groups by the written day, newest first, model order inside, undated last', () => {
		const g = groupEntries(rows, 'day');
		expect(g.map((x) => x.label)).toEqual(['Sat, Mar 14, 2026', 'Fri, Mar 13, 2026', 'No exact date']);
		expect(g[0].rows.map((r) => r.id)).toEqual([2, 4]);
		expect(g[2].rows.map((r) => r.stamp.raw)).toEqual(['yesterday 4pm']);
	});

	it('labels weeks Monday to Sunday, across a year too', () => {
		expect(weekStart('2026-03-14')).toBe('2026-03-09');
		expect(weekHeading('2026-03-09')).toBe('Mar 9 – 15, 2026');
		expect(weekHeading(weekStart('2026-01-01'))).toBe('Dec 29, 2025 – Jan 4, 2026');
		expect(weekHeading('2026-04-27')).toBe('Apr 27 – May 3, 2026');
	});

	it('turns grouping off when no timestamp parses, and for unknown values', () => {
		const timeOnly = normalizeEntries([{ id: 1, actor: 'You', action: 'Held', timestamp: '11:38' }]);
		expect(effectiveGroupBy(timeOnly, 'day')).toBe('none');
		expect(effectiveGroupBy(rows, 'month')).toBe('none');
		expect(effectiveGroupBy(rows, 'week')).toBe('week');
		expect(groupEntries(timeOnly, 'none')).toHaveLength(1);
	});

	it('formats day headings in UTC from the digits', () => {
		expect(dayHeading('2026-05-03')).toBe('Sun, May 3, 2026');
	});
});

describe('time slot and summary', () => {
	it('shows HH:MM in a day group, the date elsewhere, raw when unparsed', () => {
		const s = parseStamp('2026-05-03 14:32 UTC');
		expect(rowTime(s, { inDay: true, withZone: false, withYear: false })).toBe('14:32');
		expect(rowTime(s, { inDay: false, withZone: false, withYear: false })).toBe('May 3, 14:32');
		expect(rowTime(s, { inDay: true, withZone: true, withYear: false })).toBe('14:32 UTC');
		expect(rowTime(parseStamp('2026-03-13'), { inDay: false, withZone: false, withYear: false })).toBe('Mar 13');
		expect(rowTime(parseStamp('11:38'), { inDay: true, withZone: false, withYear: false })).toBe('11:38');
	});

	it('states one shared zone once, and the noun with every count', () => {
		const rows = normalizeEntries([
			{ id: 1, actor: 'A', action: 'x', timestamp: '2026-05-03 14:32 UTC' },
			{ id: 2, actor: 'B', action: 'y', timestamp: '2026-05-02 09:21 UTC' }
		]);
		expect(summaryLine(rows)).toBe('2 events · May 2 – 3, 2026 · times in UTC');
		expect(mixedZones(rows)).toBe(false);
		expect(summaryLine(normalizeEntries([{ id: 1, actor: 'A', action: 'x' }]))).toBe('1 event');
	});

	it('flags mixed zones so each row names its own', () => {
		const rows = normalizeEntries([
			{ id: 1, actor: 'A', timestamp: '2026-03-14T09:05:00Z' },
			{ id: 2, actor: 'B', timestamp: '2026-03-14 23:50 +05:30' }
		]);
		expect(mixedZones(rows)).toBe(true);
		expect(summaryLine(rows)).toBe('2 events · Mar 14, 2026');
	});
});

describe('normalizeEntries', () => {
	it('skips junk items, never throws on a non-array', () => {
		expect(normalizeEntries('nope')).toEqual([]);
		expect(normalizeEntries(null)).toEqual([]);
		expect(normalizeEntries(['a string', null, 3, { id: 1, actor: 'A', action: 'x' }])).toHaveLength(1);
	});

	it('strips markdown, stringifies numeric targets, blanks a whitespace type', () => {
		const [r] = normalizeEntries([{ id: 3, actor: 'Henrik', action: '**deleted** project', target: 42, type: '  ' }]);
		expect(r.action).toBe('deleted project');
		expect(r.target).toBe('42');
		expect(r.type).toBe('');
	});

	it('gives duplicate and missing ids unique keys', () => {
		const rows = normalizeEntries([{ id: '6', actor: 'K' }, { id: '6', actor: 'K' }, { actor: 'S' }]);
		expect(new Set(rows.map((r) => r.key)).size).toBe(3);
		expect(rows[2].id).toBeUndefined();
	});

	it('maps severity aliases case-insensitively, unknown to none', () => {
		expect(toSeverity('critical')).toBe('destructive');
		expect(toSeverity('error')).toBe('destructive');
		expect(toSeverity('Warning')).toBe('warning');
		expect(toSeverity('ok')).toBe('success');
		expect(toSeverity('notice')).toBe('info');
		expect(toSeverity('purple')).toBeUndefined();
		expect(toSeverity(undefined)).toBeUndefined();
	});

	it('dedupes types case-insensitively, first spelling wins', () => {
		expect(facets(['Project', 'project', '', 'auth'])).toEqual(['Project', 'auth']);
	});

	it('honours actorIcon only from the closed map, and infers bot for automation', () => {
		expect(actorIconKey('Ana', 'user')).toBe('user');
		expect(actorIconKey('System', 'not-a-real-icon')).toBe('bot');
		expect(actorIconKey('deploy-bot', undefined)).toBe('bot');
		expect(actorIconKey('Ana', 'rocket')).toBeUndefined();
	});

	it('reads boolean-ish flags', () => {
		expect(flag('true', false)).toBe(true);
		expect(flag('false', true)).toBe(false);
		expect(flag(undefined, true)).toBe(true);
	});
});

describe('details', () => {
	it('treats empty values as no details', () => {
		for (const v of [undefined, null, '', '   ', {}, []]) expect(toDetails(v)).toBeUndefined();
	});

	it('shows a flat object as labelled fields, from/to first as a change', () => {
		expect(toDetails({ from: 'Starter', to: 'Team', approvedBy: 'Ana', request_id: 'r1', mfa: true, note: null })).toEqual({
			kind: 'fields',
			change: { from: 'Starter', to: 'Team' },
			fields: [
				['Approved by', 'Ana'],
				['Request ID', 'r1'],
				['MFA', 'Yes'],
				['Note', 'None']
			]
		});
		expect(toDetails({ before: 1, after: 2 })).toEqual({ kind: 'fields', change: { from: '1', to: '2' }, fields: [] });
	});

	it('shows nested data as compact JSON and strings as text', () => {
		expect(toDetails({ plan: { from: 'A', to: 'B' }, seats: [5, 12] })).toEqual({
			kind: 'json',
			text: '{"plan":{"from":"A","to":"B"},"seats":[5,12]}'
		});
		expect(toDetails('Opened from the dashboard.')).toEqual({ kind: 'text', text: 'Opened from the dashboard.' });
	});

	it('humanizes keys', () => {
		expect(humanizeKey('approvedBy')).toBe('Approved by');
		expect(humanizeKey('ip')).toBe('IP');
		expect(humanizeKey('user-agent')).toBe('User agent');
	});
});
