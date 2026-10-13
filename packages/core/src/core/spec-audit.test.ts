// @file core/spec-audit.test.ts
// @description specAudit reports one AuditReport per check with JSON Pointer
//   paths, and runs the shared planted-fault corpus: every entry's items must
//   equal its `expect.core` list exactly, and its warnings `expect.warnings`
//   (pocketpaw runs the same corpus against `expect.python`). The corpus
//   catalog below copies the full manifest's entries for the widgets the
//   corpus uses; the audit's `now` is fixed.
import { describe, it, expect } from 'vitest';
import type { SlimWidgetEntry } from '../manifest/slim.js';
import type { AuditItem } from './audit-report.js';
import { specAudit, toPointer, type SpecAuditOptions } from './spec-audit.js';

interface CorpusEntry {
	about: string;
	spec: unknown;
	expect: { core: AuditItem[]; python: { code: string; path: string }[]; warnings?: AuditItem[] };
}

const CORPUS = import.meta.glob('./__fixtures__/audit-corpus/*.json', {
	import: 'default',
	eager: true
}) as Record<string, CorpusEntry>;

const field = (required = false) => ({ type: 'string', required, description: '' });
const entry = (type: string, category: string, props: string[], required: string[] = []): SlimWidgetEntry => ({
	type,
	category,
	description: '',
	props: Object.fromEntries([...props, ...required].map((p) => [p, field(required.includes(p))])),
	example: { type }
});

/** The widgets both catalogs know, with the full manifest's prop names; the corpus uses only these. */
const widgets: SlimWidgetEntry[] = [
	entry('card', 'layout', ['title', 'description', 'variant', 'density', 'interactive']),
	entry('text', 'display', ['text', 'size', 'weight', 'color', 'inline']),
	entry('button', 'input', ['label', 'variant', 'size', 'disabled', 'loading', 'type', 'icon', 'description']),
	entry('quiz', 'composite', ['title', 'topic', 'seconds_per_question', 'shuffle_choices', 'value', 'sound'], ['questions']),
	entry('input', 'input', ['label', 'bind', 'value', 'placeholder', 'type', 'size', 'disabled', 'readOnly', 'required', 'error', 'helper'])
];
const catalog: SpecAuditOptions = { widgets, now: { iso: '2026-10-13T12:00:00Z', tz: 'UTC' } };

const items = (spec: unknown, opts = catalog) => specAudit(spec, opts).flatMap((r) => r.items);
const warnings = (spec: unknown) => specAudit(spec, catalog).flatMap((r) => r.warnings ?? []);
const CHECKS = ['schema', 'catalog', 'action', 'envelope', 'leftover', 'each', 'bind', 'expr', 'props', 'twoControls', 'size', 'futureDate'];

describe('specAudit', () => {
	it('reports every check in a fixed order, each with a count that matches its items', () => {
		const reports = specAudit({ ui: { type: 'card', children: [{ type: 'nope' }] } }, catalog);
		expect(reports.map((r) => r.check)).toEqual(CHECKS);
		expect(reports.map((r) => r.count)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(reports[1].items).toEqual([
			{ code: 'unknownWidget', path: '/ui/children/0', message: 'widget type "nope" isn\'t in the catalog' }
		]);
	});

	it('points at the whole spec with an empty pointer', () => {
		expect(items(null)).toEqual([
			expect.objectContaining({ code: 'schema', path: '' })
		]);
	});

	it('leaves out a check whose input was not given, rather than passing it', () => {
		const checks = specAudit({ ui: { type: 'card' } }, { widgetTypes: ['card'] }).map((r) => r.check);
		expect(checks).toEqual(CHECKS.filter((c) => c !== 'props' && c !== 'futureDate'));
	});

	it('names an unknown action inside a flow step and drops the schema echo', () => {
		const spec = {
			ui: { type: 'button', props: { label: 'Go' }, on_click: { action: 'flow', steps: [{ action: 'set', target: 'a' }, { action: 'boom' }] } },
			state: { a: 1 }
		};
		expect(items(spec)).toEqual([expect.objectContaining({ code: 'badAction', path: '/ui/on_click/steps/1' })]);
	});

	it('keeps a schema fault in a handler that names a real action', () => {
		const spec = { ui: { type: 'button', props: { label: 'Go' }, on_click: { action: 'set' } }, state: {} };
		expect(items(spec)).toEqual([expect.objectContaining({ code: 'schema', path: '/ui/on_click' })]);
	});

	it('flags text that resolves to raw JSON or NaN, but not handler templates', () => {
		const spec = {
			ui: {
				type: 'card',
				children: [
					{ type: 'text', props: { text: 'Order {state.order}' } },
					{ type: 'text', props: { text: 'Average {state.avg}' } },
					{ type: 'button', props: { label: 'Go' }, on_click: { action: 'set', target: 'avg', value: '{state.missing}' } }
				]
			},
			state: { order: { id: 7 }, avg: 'NaN' }
		};
		expect(items(spec)).toEqual([
			{ code: 'leftover', path: '/ui/children/0/props/text', message: 'this prop renders as "Order {"id":7}"' },
			{ code: 'leftover', path: '/ui/children/1/props/text', message: 'this prop renders as "Average NaN"' }
		]);
	});

	it('reports a bind missing in one loop row once, at the node', () => {
		const spec = {
			ui: { type: 'each', items: '{state.rows}', children: [{ type: 'input', bind: 'rows.{index}.qty' }] },
			state: { rows: [{ qty: 1 }, {}, {}] }
		};
		expect(items(spec)).toEqual([
			{ code: 'bindMissing', path: '/ui/children/0/bind', message: 'bind path `rows.1.qty` is not in state; seed it' },
			{ code: 'bindMissing', path: '/ui/children/0/bind', message: 'bind path `rows.2.qty` is not in state; seed it' }
		]);
	});

	it('reads today in the caller time zone, with one day of slack', () => {
		const spec = (date: string) => ({ ui: { type: 'text', props: { text: date } }, state: {} });
		const now = { iso: '2026-10-13T20:00:00Z', tz: 'Asia/Kolkata' }; // already the 14th there
		const opts = { widgets, now };
		expect(items(spec('2026-10-15'), opts)).toEqual([]);
		expect(items(spec('2026-10-16'), opts)).toEqual([expect.objectContaining({ code: 'futureDate' })]);
		expect(items(spec('Slot 2026-10-16T10:00'), opts)).toEqual([expect.objectContaining({ code: 'futureDate' })]);
	});

	it('escapes ~ and / in pointer tokens', () => {
		expect(toPointer(['state', 'a/b', 'c~d', 0])).toBe('/state/a~1b/c~0d/0');
	});
});

describe('audit corpus (core side)', () => {
	const entries = Object.entries(CORPUS);

	it('holds the planted faults and a clean control', () => {
		expect(entries.length).toBeGreaterThanOrEqual(3);
		expect(entries.some(([, e]) => e.expect.core.length === 0 && e.expect.python.length === 0)).toBe(true);
	});

	it.each(entries)('%s matches expect.core exactly', (_name, entry) => {
		expect(items(entry.spec)).toEqual(entry.expect.core);
		expect(warnings(entry.spec)).toEqual(entry.expect.warnings ?? []);
	});

	it('plants a fault for every check', () => {
		const planted = new Set(
			entries.flatMap(([, e]) => specAudit(e.spec, catalog).filter((r) => r.count || r.warnings).map((r) => r.check))
		);
		expect([...planted].sort()).toEqual([...CHECKS].sort());
	});
});
