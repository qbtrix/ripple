// skill-widgets.test.ts: holds the Ripple skill's references (widgets.md and
// craft.md under skills/ripple/references at the repo root) to the real
// manifest. In widgets.md every widget a table row names must exist, every prop
// its key-props cell lists must be a prop or event of one of that row's widgets
// (or a node-level field), and nested fields written as prop[{a,b}] or
// prop{a,b} must appear in that prop's type; the `verdict` line is checked the
// same way. In craft.md every identifier in backticks must be a widget, a prop
// or event, an action, a node field or an audit check id (gallery recordings,
// written after "G: ", are skipped). In both files every `rule:<id>` and
// `waiver:<widget>/<check>` must exist in the manifest's craft data, and every
// manifest rule id must appear in craft.md. An agent that follows the skill
// writes specs that validate and cites rules the critic knows, so the
// references must not drift.
// ripple's tsconfig carries no node types (same as theme-aliases.test.ts).
// @ts-ignore
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_IDS } from '@ripple-ui/core/manifest';
import { buildManifest } from './index.js';

// Tests run from packages/svelte, like the other file-reading tests here.
const MAP = '../../skills/ripple/references/widgets.md';
const md: string = readFileSync(MAP, 'utf8');
const craftMd: string = readFileSync('../../skills/ripple/references/craft.md', 'utf8');
const manifest = buildManifest();
const widgets = new Map(manifest.widgets.map((w) => [w.type, w]));
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

// Names craft.md uses that are not widgets or props: button variants, the spec's
// `theme` block, engine functions and modules, an emit name in a gallery card.
const PROSE_NAMES = ['outline', 'ghost', 'theme', 'specStatus', 'specIssues', 'text-coerce', 'send_quote'];

const ruleIds = (text: string) => [...text.matchAll(/`rule:([a-z0-9-]+)`/g)].map((m) => m[1]);

/** Rule ids the docs name that the manifest lacks, and manifest ids craft.md lacks. */
function ruleDrift(docs: string[], craftDoc: string, ids: readonly string[]) {
	const known = new Set(ids);
	const inCraft = new Set(ruleIds(craftDoc));
	return {
		ghosts: docs.flatMap(ruleIds).filter((id) => !known.has(id)),
		missing: ids.filter((id) => !inCraft.has(id))
	};
}

describe('skills/ripple/references craft ids', () => {
	const ids = manifest.craft.rules.map((r) => r.id);

	it('every rule id in the docs is in the manifest, and every manifest rule id is in craft.md', () => {
		expect(ruleIds(craftMd).length).toBeGreaterThan(40);
		expect(ruleDrift([md, craftMd], craftMd, ids)).toEqual({ ghosts: [], missing: [] });
	});

	it('catches a rule id removed from either side', () => {
		const [first] = ids;
		expect(ruleDrift([md, craftMd], craftMd, ids.slice(1)).ghosts).toEqual([first]);
		const cut = craftMd.replace(`\`rule:${first}\``, '');
		expect(ruleDrift([md, cut], cut, ids).missing).toEqual([first]);
	});

	it('every waiver the docs name is a manifest waiver', () => {
		const live = new Set(manifest.waivers.map((w) => `${w.widget}/${w.check}`));
		const named = [md, craftMd].flatMap((doc) => [...doc.matchAll(/`waiver:([a-z0-9-]+\/[A-Za-z]+)`/g)].map((m) => m[1]));
		expect(named.length).toBeGreaterThan(0);
		expect(named.filter((w) => !live.has(w))).toEqual([]);
	});

	it('craft.md names only real widgets, props, actions and checks', () => {
		const known = new Set<string>([
			...NODE_FIELDS,
			...CHECK_IDS,
			...Object.keys(manifest.actions),
			...Object.keys(manifest),
			...PROSE_NAMES
		]);
		for (const w of manifest.widgets) {
			known.add(w.type);
			for (const p of Object.keys(w.props)) known.add(p);
			for (const e of Object.keys(w.events ?? {})) known.add(e);
		}
		const ghosts = [...craftMd.matchAll(/(G:\s+)?`([a-z][A-Za-z0-9_]*(?:-[a-z0-9]+)*)`/g)]
			.filter(([, gallery, name]) => !gallery && !known.has(name))
			.map(([, , name]) => name);
		expect(ghosts).toEqual([]);
	});
});
