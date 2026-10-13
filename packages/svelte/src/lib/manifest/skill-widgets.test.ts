// skill-widgets.test.ts: holds the Ripple skill's widget map
// (skills/ripple/references/widgets.md at the repo root) to the real manifest.
// Every widget a table row names must exist, every prop its key-props cell
// lists must be a prop or event of one of that row's widgets (or a node-level
// field), and nested fields written as prop[{a,b}] or prop{a,b} must appear in
// that prop's type. The `verdict` line is checked the same way. An agent that
// follows the map writes specs that validate, so the map must not drift.
// ripple's tsconfig carries no node types (same as theme-aliases.test.ts).
// @ts-ignore
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildManifest } from './index.js';

// Tests run from packages/svelte, like the other file-reading tests here.
const MAP = '../../skills/ripple/references/widgets.md';
const md: string = readFileSync(MAP, 'utf8');
const widgets = new Map(buildManifest().widgets.map((w) => [w.type, w]));
// Fields that sit on the node, not in props.
const NODE_FIELDS = new Set(['bind', 'items', 'condition', 'item_as', 'index_as', 'children']);

const spans = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const typeOf = (w: string[], prop: string) =>
	w
		.map((t) => widgets.get(t))
		.map((e) => (e?.props?.[prop] ?? e?.events?.[prop])?.type ?? '')
		.join(' ');

/** Every widget table row: its widget names and its key-props cell. */
function rows() {
	const out: { line: string; names: string[]; props: string }[] = [];
	for (const line of md.split('\n')) {
		if (!line.startsWith('|') || /^\|[-\s|]+\|$/.test(line)) continue;
		const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
		const names = spans(cells[2] ?? '').filter((s) => /^[a-z][a-z0-9-]*$/.test(s));
		if (names.length) out.push({ line, names, props: cells[3] ?? '' });
	}
	return out;
}

describe('skills/ripple/references/widgets.md', () => {
	const all = rows();

	it('has widget rows to check', () => {
		expect(all.length).toBeGreaterThan(40);
	});

	it('names only widgets that exist', () => {
		const ghosts = all.flatMap((r) => r.names.filter((n) => !widgets.has(n)));
		expect(ghosts).toEqual([]);
	});

	it('lists only real props, with real nested fields', () => {
		const bad: string[] = [];
		for (const { names, props } of all) {
			for (const span of spans(props)) {
				const m = /^([A-Za-z_]\w*)\*?(.*)$/s.exec(span);
				if (!m) continue; // a literal like "USD" or {item}
				const [, prop, rest] = m;
				if (NODE_FIELDS.has(prop) || prop.startsWith('on_')) continue;
				const type = typeOf(names, prop);
				if (!type) {
					bad.push(`${names.join('/')}: ${prop}`);
					continue;
				}
				if (!/^[[{]/.test(rest)) continue;
				for (const [, key] of rest.matchAll(/[{,]\s*([A-Za-z_]\w*)/g))
					if (!new RegExp(`\\b${key}\\??:`).test(type)) bad.push(`${names.join('/')}: ${prop}.${key}`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('the verdict line names only widgets that take verdict', () => {
		const line = md.split('\n').find((l) => l.startsWith('`verdict` works on'));
		expect(line).toBeDefined();
		const names = spans(line!.replace(/^`verdict`/, ''));
		expect(names.length).toBeGreaterThan(5);
		expect(names.filter((n) => !widgets.get(n)?.props?.verdict)).toEqual([]);
	});
});
