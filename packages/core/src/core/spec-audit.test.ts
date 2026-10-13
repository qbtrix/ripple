// @file core/spec-audit.test.ts
// @description specAudit reports one AuditReport per check with JSON Pointer
//   paths, and runs the shared planted-fault corpus: every entry's items must
//   equal its `expect.core` list exactly (pocketpaw runs the same corpus
//   against `expect.python`).
import { describe, it, expect } from 'vitest';
import type { AuditItem } from './audit-report.js';
import { specAudit, toPointer } from './spec-audit.js';

interface CorpusEntry {
	about: string;
	spec: unknown;
	expect: { core: AuditItem[]; python: { code: string; path: string }[] };
}

const CORPUS = import.meta.glob('./__fixtures__/audit-corpus/*.json', {
	import: 'default',
	eager: true
}) as Record<string, CorpusEntry>;

/** The widget types both catalogs know; the corpus uses only these. */
const catalog = { widgetTypes: ['card', 'text', 'button', 'quiz'] };

const items = (spec: unknown) => specAudit(spec, catalog).flatMap((r) => r.items);

describe('specAudit', () => {
	it('reports schema then catalog, each with a count that matches its items', () => {
		const reports = specAudit({ ui: { type: 'card', children: [{ type: 'nope' }] } }, catalog);
		expect(reports.map((r) => r.check)).toEqual(['schema', 'catalog']);
		expect(reports.map((r) => r.count)).toEqual([0, 1]);
		expect(reports[1].items).toEqual([
			{ code: 'unknownWidget', path: '/ui/children/0', message: 'widget type "nope" isn\'t in the catalog' }
		]);
	});

	it('points at the whole spec with an empty pointer', () => {
		expect(items(null)).toEqual([
			expect.objectContaining({ code: 'schema', path: '' })
		]);
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
	});
});
