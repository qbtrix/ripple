// @file core/data-guard.ts
// @description The data guard: rule 1 of the skill ("the user's data is not
//   yours to change") as a pure check the build loop runs on every round.
//   - Baseline: the host's `given` facts when it passes any (`baseline:
//     'facts'`), else the round-1 spec (`baseline: 'round1'`), which is weaker
//     because round 1 itself can be bent.
//   - Data: `state` leaves, plus the resolved props a widget marks as data
//     (`DATA_PROPS` in craft, plus any prop a host's widget entry marks
//     `data: true`, so a host widget can join).
//     A prop that is only a state reference (`{state.days}`) is not counted
//     again; a computed one (`{state.a * 2}`) counts as its value.
//     The numbers inside a data prop's text ("$1,200") count as numbers too.
//   - Compare as a multiset, not by path: every baseline number and date must
//     still appear as often as before, so a state restructure that keeps the
//     values passes. A missing value is still found when it shows up as a
//     token in any rendered prop text ("5%" in a label).
//   - Fails (`items`): a missing or changed number or date (`dataChanged`), a
//     date after `now` plus a day that the baseline never had (`inventedDate`,
//     skipped under `meta.sample: true`), and a number an expression computed
//     that is now written as a literal (`hardCoded`). Flags (`warnings`): a
//     string that changed, which may be the same fact reworded.
//   - Preview copies (a ticked or chosen state) are separate files the host
//     never passes here, so they cannot trip the guard.
//   Pure: no clock (time is the caller's `now`), no DOM, no files.

import type { SlimWidgetEntry } from '../manifest/slim.js';
import { DATA_PROPS } from '../manifest/craft.js';
import { resolveTree } from '../headless/resolve-tree.js';
import type { ResolvedNode } from '../headless/types.js';
import type { AuditItem } from './audit-report.js';

/** A value the host knows about. `given` facts are the user's and must survive; `invented` ones are filler. */
export interface Fact {
	path?: string;
	value: string | number;
	kind: 'given' | 'invented';
}

export interface DataGuardOptions {
	/** The baseline spec (round 1) when no facts are given. */
	before?: unknown;
	after: unknown;
	facts?: readonly Fact[];
	now: { iso: string; tz: string };
	widgets?: readonly SlimWidgetEntry[];
}

export interface DataGuardResult {
	ok: boolean;
	baseline: 'facts' | 'round1';
	items: AuditItem[];
	warnings: AuditItem[];
}

type Obj = Record<string, unknown>;
type Kind = 'number' | 'date' | 'string';
interface Leaf {
	key: string;
	kind: Kind;
	shown: string;
	at: string;
	derived?: boolean;
}

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (k: PropertyKey) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
const ISO_DAY = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;
const ISO_DAYS = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;
const NUMBERS = /-?\d[\d,]*(?:\.\d+)?/g;
const EXPR = /\{[^{}]+\}/;
const REF_ONLY = /^\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*\s*\}$/;

/** A data value's multiset key, or null for values that are not data (booleans, null, blanks). */
function classify(value: unknown): { key: string; kind: Kind; shown: string } | null {
	if (typeof value === 'number' && Number.isFinite(value)) return { key: `n:${value}`, kind: 'number', shown: String(value) };
	if (typeof value !== 'string' || !value.trim()) return null;
	const day = ISO_DAY.exec(value)?.[1];
	if (day) return { key: `d:${day}`, kind: 'date', shown: day };
	return { key: `s:${value}`, kind: 'string', shown: JSON.stringify(value) };
}

function leavesOf(value: unknown, at: string, out: { value: unknown; at: string }[] = []) {
	if (Array.isArray(value)) value.forEach((v, i) => leavesOf(v, `${at}/${i}`, out));
	else if (isObj(value)) for (const [k, v] of Object.entries(value)) leavesOf(v, `${at}/${esc(k)}`, out);
	else out.push({ value, at });
	return out;
}

/** Raw spec node to its JSON Pointer. */
function pointers(ui: unknown): Map<object, string> {
	const out = new Map<object, string>();
	const walk = (node: unknown, at: string) => {
		if (!isObj(node)) return;
		out.set(node, at);
		for (const key of ['children', 'else_children']) {
			const kids = node[key];
			if (Array.isArray(kids)) kids.forEach((kid, i) => walk(kid, `${at}/${key}/${i}`));
		}
	};
	walk(ui, '/ui');
	return out;
}

const flatten = (nodes: ResolvedNode[]): ResolvedNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

/** The data leaves of a spec, plus the text of every rendered prop (where a missing value may still show). */
function dataOf(spec: unknown, widgets?: readonly SlimWidgetEntry[]) {
	const data: Leaf[] = [];
	const text: string[] = [];
	if (!isObj(spec)) return { data, text };
	const state = isObj(spec.state) ? spec.state : {};
	for (const { value, at } of leavesOf(state, '/state')) {
		const c = classify(value);
		if (c) data.push({ ...c, at });
		if (typeof value === 'string') text.push(value);
	}
	const byType = new Map(widgets?.map((w) => [w.type, w]));
	const isData = (type: string, prop: string) =>
		byType.get(type)?.props[prop]?.data === true || DATA_PROPS[type]?.includes(prop) === true;
	let resolved: ResolvedNode[] = [];
	try {
		resolved = flatten(resolveTree(spec.ui as never, { state }).nodes);
	} catch {
		// A tree that does not resolve is the spec audit's `leftover` item; the guard reads state only.
	}
	const where = pointers(spec.ui);
	for (const node of resolved) {
		const at = (node.source && where.get(node.source)) ?? '/ui';
		const raw = isObj(node.source?.props) ? node.source.props : {};
		for (const [prop, value] of Object.entries(node.props)) {
			const rawLeaves = new Map(leavesOf(raw[prop], '').map((l) => [l.at, l.value]));
			const isDataProp = isData(node.type, prop);
			for (const leaf of leavesOf(value, '')) {
				// Text a reader sees outside the data leaves: every string, and numbers in layout props.
				if (typeof leaf.value === 'string' || (!isDataProp && typeof leaf.value === 'number')) text.push(String(leaf.value));
				if (!isDataProp) continue;
				// The nearest raw leaf at or above this resolved one says where the value came from.
				let src: unknown = undefined;
				for (let p = leaf.at; ; p = p.slice(0, p.lastIndexOf('/'))) {
					if (rawLeaves.has(p)) {
						src = rawLeaves.get(p);
						break;
					}
					if (!p) break;
				}
				const expr = typeof src === 'string' && EXPR.test(src);
				if (expr && REF_ONLY.test((src as string).trim())) continue; // a state reference, counted in state
				const c = classify(leaf.value);
				const where = `${at}/props/${esc(prop)}${leaf.at}`;
				if (c) data.push({ ...c, at: where, derived: expr });
				// A formatted amount ("$1,200") in a data prop is still a number the user gave.
				if (c?.kind === 'string')
					for (const n of numberTokens(leaf.value as string))
						data.push({ key: `n:${n}`, kind: 'number', shown: String(n), at: where, derived: expr });
			}
		}
	}
	return { data, text };
}

function tally(leaves: readonly Leaf[]) {
	const out = new Map<string, Leaf[]>();
	for (const leaf of leaves) out.set(leaf.key, [...(out.get(leaf.key) ?? []), leaf]);
	return out;
}

const numberTokens = (t: string) => [...t.replace(ISO_DAYS, ' ').matchAll(NUMBERS)].map(([n]) => Number(n.replace(/,/g, '')));

/** Number and date tokens in rendered text, as a multiset of keys. */
function tokens(text: readonly string[]) {
	const out = new Map<string, number>();
	const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
	for (const t of text) {
		for (const [d] of t.matchAll(ISO_DAYS)) add(`d:${d}`);
		for (const n of numberTokens(t)) add(`n:${n}`);
	}
	return out;
}

/** The day after the caller's today, as YYYY-MM-DD in the caller's zone. */
function dayAfter(now: { iso: string; tz: string }) {
	const today = new Date(now.iso).toLocaleDateString('en-CA', { timeZone: now.tz });
	const [y, m, d] = today.split('-').map(Number);
	return { today, limit: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) };
}

/** Did `after` keep the baseline's data? See the file header for the rules. */
export function dataGuard(opts: DataGuardOptions): DataGuardResult {
	const given = opts.facts?.filter((f) => f.kind === 'given') ?? [];
	const baseline = given.length ? 'facts' : 'round1';
	const before = dataOf(opts.before, opts.widgets);
	const after = dataOf(opts.after, opts.widgets);
	const base: Leaf[] =
		baseline === 'facts'
			? given.flatMap((f) => {
					const c = classify(f.value);
					return c ? [{ ...c, at: f.path ?? '' }] : [];
				})
			: before.data;

	const items: AuditItem[] = [];
	const warnings: AuditItem[] = [];
	const had = tally(base);
	const has = tally(after.data);
	const shown = tokens(after.text);

	for (const [key, was] of had) {
		let missing = was.length - (has.get(key)?.length ?? 0);
		if (missing <= 0) continue;
		const leaf = was[was.length - missing];
		if (leaf.kind === 'string') {
			warnings.push({
				code: 'dataStringChanged',
				path: leaf.at,
				message: `the text ${leaf.shown} is gone or reworded; keep it unless it is the same fact`
			});
			continue;
		}
		// Still on the card as a token in some rendered text ("5%", "Due 2026-10-14")?
		missing -= Math.min(missing, shown.get(key) ?? 0);
		if (missing > 0)
			items.push({
				code: 'dataChanged',
				path: leaf.at,
				message: `the ${leaf.kind} ${leaf.shown} is ${missing > 1 ? `${missing} times ` : ''}gone or changed; the user's data is not yours to change, keep it exactly`
			});
	}

	const root = isObj(opts.after) ? opts.after : {};
	const sample = isObj(root.meta) && root.meta.sample === true;
	if (!sample) {
		const { today, limit } = dayAfter(opts.now);
		const known = new Set([...base.map((l) => l.key), ...(opts.facts ?? []).map((f) => classify(f.value)?.key)]);
		for (const leaf of after.data)
			if (leaf.kind === 'date' && !known.has(leaf.key) && leaf.shown > limit)
				items.push({
					code: 'inventedDate',
					path: leaf.at,
					message: `${leaf.shown} is a new date after today (${today}); an invented date stays in the past or present`
				});
	}

	if (opts.before) {
		const literals = (d: Leaf[]) => tally(d.filter((l) => l.kind === 'number' && !l.derived));
		const derived = (d: Leaf[]) => tally(d.filter((l) => l.kind === 'number' && l.derived));
		const [db, da, lb, la] = [derived(before.data), derived(after.data), literals(before.data), literals(after.data)];
		for (const [key, was] of db) {
			const lost = was.length - (da.get(key)?.length ?? 0);
			const gained = (la.get(key)?.length ?? 0) - (lb.get(key)?.length ?? 0);
			if (lost > 0 && gained > 0) {
				const leaf = la.get(key)!.at(-1)!;
				items.push({
					code: 'hardCoded',
					path: leaf.at,
					message: `${was[0].shown} was computed by an expression and is now written by hand; keep the expression so it follows its inputs`
				});
			}
		}
	}

	return { ok: items.length === 0, baseline, items, warnings };
}
