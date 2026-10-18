// @file core/spec-audit.ts
// @description The pure spec audit: every check a host can run on a UISpec
//   with no DOM, as one `AuditReport<AuditItem>` per check, paths as JSON
//   Pointers. Reports come in a fixed order, which is part of the contract:
//   schema, catalog, action, envelope, leftover, each, bind, expr, props,
//   twoControls, size, futureDate.
//   - schema (zod) and catalog (unknown widget types), called directly rather
//     than through `specIssues`, which flattens which check found a problem.
//     A schema fault inside an `on_*` handler that the action check names is
//     reported once, as `badAction`.
//   - action: every handler and sub-step names an `EventAction`.
//   - envelope: a top-level key from `specEnvelope.aliasesNotAllowed`.
//   - leftover, bind, twoControls read the tree after `resolveTree` against
//     the seed state. expr evaluates each resolved node's source props with
//     its loop context, calling the evaluator directly since `resolveString`
//     swallows every throw; an embedded expression that comes out undefined
//     (blank in the render) is a leftover. Leftover text is only looked for in
//     strings that resolution changed. each and props read the raw tree.
//   - size: the base64url share link (`specFromUrl.ts` in the svelte package)
//     must fit `SHARE_CAP`.
//   - futureDate: an ISO date more than a day after `now`, skipped (count 0)
//     under `meta.sample: true`.
//   A check that needs an input it was not given does not report at all:
//   props needs `widgets`, futureDate needs `now`. A count-0 report always
//   means the check ran. Unknown props are `warnings`, not counted.
//   Pure: no clock (time is the caller's `now`), no DOM, no files.
//   The shared planted-fault corpus (`__fixtures__/audit-corpus/`, vendored by
//   pocketpaw) pins what each check reports.

import { safeParseUISpec } from '../schema/ui-spec.js';
import { EventAction } from '../schema/event-handler.js';
import { specEnvelope } from '../manifest/envelope.js';
import type { SlimWidgetEntry } from '../manifest/slim.js';
import { resolveTree } from '../headless/resolve-tree.js';
import type { ResolvedNode } from '../headless/types.js';
import type { AuditItem, AuditReport } from './audit-report.js';
import { evaluateExpression, findExpressions } from './expression-resolver.js';
import { getStatePath } from './state-mutator.js';
import { validateCatalog, type ValidateCatalogOptions } from './validate-catalog.js';

export interface SpecAuditOptions extends ValidateCatalogOptions {
	/** The catalog with props. Turns on the props check; gives `widgetTypes` when that is omitted. */
	widgets?: readonly SlimWidgetEntry[];
	/** The caller's clock. Turns on the futureDate check. */
	now?: { iso: string; tz: string };
}

/** The share link cap, in base64url chars (`SPEC_URL_MAX` in the svelte package's `specFromUrl.ts`). */
export const SHARE_CAP = 64 * 1024;

type Obj = Record<string, unknown>;

const escapeToken = (token: PropertyKey) => String(token).replace(/~/g, '~0').replace(/\//g, '~1');

/** `['ui', 'children', 2]` → `/ui/children/2`. */
export function toPointer(segments: readonly PropertyKey[]): string {
	return segments.map((s) => `/${escapeToken(s)}`).join('');
}

/** validateCatalog's `ui.children[2].else_children[0]` → `/ui/children/2/else_children/0`. */
function catalogPointer(path: string): string {
	return toPointer(path.split(/\.|\[(\d+)\]/).filter((s) => s !== undefined && s !== ''));
}

const report = (check: string, items: AuditItem[], warnings?: AuditItem[]): AuditReport<AuditItem> => ({
	check,
	count: items.length,
	items,
	...(warnings?.length ? { warnings } : {})
});

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Values `resolveValue` passes through raw: a node subtree or an action. */
const isRaw = (v: Obj) =>
	typeof v.action === 'string' ||
	(typeof v.type === 'string' && ['props', 'children', 'bind', 'show', 'items', 'condition'].some((k) => k in v));

/** Every node of the raw tree with its pointer, parents first. */
function nodesOf(ui: unknown): { node: Obj; at: string }[] {
	const out: { node: Obj; at: string }[] = [];
	const walk = (node: unknown, at: string) => {
		if (!isObj(node)) return;
		out.push({ node, at });
		for (const key of ['children', 'else_children']) {
			const kids = node[key];
			if (Array.isArray(kids)) kids.forEach((kid, i) => walk(kid, `${at}/${key}/${i}`));
		}
	};
	walk(ui, '/ui');
	return out;
}

/** Every leaf under `value` with its pointer, not descending into raw subtrees. */
function leaves(value: unknown, at: string, out: { value: unknown; at: string }[] = []) {
	if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${at}/${i}`, out));
	else if (isObj(value)) {
		if (!isRaw(value)) for (const [k, v] of Object.entries(value)) leaves(v, `${at}/${escapeToken(k)}`, out);
	} else out.push({ value, at });
	return out;
}

const dedupe = (items: AuditItem[]) => {
	const seen = new Set<string>();
	return items.filter((i) => {
		const key = `${i.code} ${i.path} ${i.message}`;
		return seen.has(key) ? false : (seen.add(key), true);
	});
};

const ACTIONS = new Set<string>(EventAction.options);
const STEP_KEYS = ['steps', 'then', 'else', 'on_success', 'on_error', 'on_confirm', 'on_cancel'];

/** An action name the engine does not run, in a node's handlers or their sub-steps. */
function actionItems(nodes: { node: Obj; at: string }[]): AuditItem[] {
	const items: AuditItem[] = [];
	const walk = (value: unknown, at: string) => {
		if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${at}/${i}`));
		if (!isObj(value)) return;
		const name = value.action;
		if (typeof name !== 'string' || !ACTIONS.has(name)) {
			items.push({
				code: 'badAction',
				path: at,
				message: `action ${JSON.stringify(name ?? null)} is not one the engine runs; use one of ${[...ACTIONS].join(', ')}`
			});
			return;
		}
		for (const key of STEP_KEYS) if (key in value) walk(value[key], `${at}/${key}`);
	};
	for (const { node, at } of nodes)
		for (const key of Object.keys(node)) if (key.startsWith('on_')) walk(node[key], `${at}/${escapeToken(key)}`);
	return items;
}

function envelopeItems(spec: Obj): AuditItem[] {
	return specEnvelope.aliasesNotAllowed
		.filter((alias) => alias in spec)
		.map((alias) => ({
			code: 'envelopeAlias',
			path: `/${alias}`,
			message: `the node tree goes in \`ui\`, not \`${alias}\``
		}));
}

const LEFTOVER_WORDS = /\bundefined\b|\bNaN\b|\bInfinity\b|\[object Object\]/;
/** A brace the resolver would still read as an expression; literal TeX/mermaid braces are not leftovers. */
const leftoverText = (value: string) =>
	LEFTOVER_WORDS.test(value) || findExpressions(value, { state: {} }).some((s) => /\{[^{}\s][^{}]*\}/.test(value.slice(s.start, s.end)));

/** Where a resolved node's spec node sits, through `ResolvedNode.source`. */
const flatten = (nodes: ResolvedNode[]): ResolvedNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

const READS_DATA = /(?<![\w.$])data\b/; // host data, not in the spec

/**
 * Per node and loop copy: props expressions the evaluator throws on (`thrown`),
 * and ones that come out undefined, which render as blank (`blank`, leftovers;
 * not for expressions reading host `data`).
 */
function exprItems(resolved: ResolvedNode[], where: Map<object, string>, state: Obj) {
	const items: AuditItem[] = [];
	const blank: AuditItem[] = [];
	for (const node of resolved) {
		const at = node.source && where.get(node.source);
		if (!at) continue;
		for (const leaf of leaves(node.source?.props, `${at}/props`)) {
			if (typeof leaf.value !== 'string') continue;
			const ctx = { state, data: {}, ...(node.loop ?? {}) };
			for (const { expr } of findExpressions(leaf.value, ctx)) {
				try {
					const value = evaluateExpression(expr, ctx);
					if (value === undefined && !READS_DATA.test(expr))
						blank.push({
							code: 'leftover',
							path: leaf.at,
							message: `\`{${expr}}\` is undefined, so it renders as blank; seed the state it reads`
						});
				} catch {
					// The engine's own error text differs by JS engine; keep the message stable.
					items.push({
						code: 'exprThrows',
						path: leaf.at,
						message: `\`{${expr}}\` throws when evaluated, so the prop renders as nothing`
					});
				}
			}
		}
	}
	return { thrown: dedupe(items), blank };
}

/**
 * Resolved prop values that did not resolve to something a person can read.
 * undefined and non-finite numbers cannot be JSON, so they always come from
 * resolution; leftover text is only looked for where resolution changed the
 * string, so literal text ("Infinity pool") passes.
 */
function leftoverItems(resolved: ResolvedNode[], where: Map<object, string>, skip: Set<string>): AuditItem[] {
	const items: AuditItem[] = [];
	for (const node of resolved) {
		const at = node.source && where.get(node.source);
		if (!at) continue;
		const source = new Map(leaves(node.source?.props, `${at}/props`).map((l) => [l.at, l.value]));
		for (const leaf of leaves(node.props, `${at}/props`)) {
			if (skip.has(leaf.at)) continue;
			const { value } = leaf;
			const bad =
				value === undefined
					? 'resolves to undefined; seed the state it reads'
					: typeof value === 'number' && !Number.isFinite(value)
						? `resolves to ${value}`
						: typeof value === 'string' && source.get(leaf.at) !== value && leftoverText(value)
							? `renders as "${value.slice(0, 60)}"`
							: '';
			if (bad) items.push({ code: 'leftover', path: leaf.at, message: `this prop ${bad}` });
		}
	}
	return dedupe(items);
}

/** `each` nodes whose `items` path does not hold an array in the seed state. */
function eachItems(nodes: { node: Obj; at: string }[], state: Obj): AuditItem[] {
	const items: AuditItem[] = [];
	for (const { node, at } of nodes) {
		if (node.type !== 'each') continue;
		const raw = node.items;
		const path = typeof raw === 'string' ? raw.replace(/^\{|\}$/g, '').trim() : '';
		if (path.startsWith('data.')) continue; // host data, not in the spec
		const value = path ? getStatePath(state, path.replace(/^state\./, '')) : undefined;
		if (!Array.isArray(value))
			items.push({
				code: 'eachNotArray',
				path: `${at}/items`,
				message: path
					? `\`${path}\` is ${value === undefined ? 'not in state' : `a ${typeof value}`}; \`each\` needs an array`
					: '`each` has no `items` path'
			});
	}
	return items;
}

function bindItems(resolved: ResolvedNode[], where: Map<object, string>): AuditItem[] {
	return dedupe(
		resolved.flatMap((node) => {
			const at = node.source && where.get(node.source);
			return at && node.bind && node.bind.value === undefined
				? [{ code: 'bindMissing', path: `${at}/bind`, message: `bind path \`${node.bind.path}\` is not in state; seed it` }]
				: [];
		})
	);
}

/** Missing required props (items) and props the entry does not document (warnings). */
function propsReport(nodes: { node: Obj; at: string }[], widgets: readonly SlimWidgetEntry[]): AuditReport<AuditItem> {
	const byType = new Map(widgets.map((w) => [w.type, w]));
	const items: AuditItem[] = [];
	const warnings: AuditItem[] = [];
	for (const { node, at } of nodes) {
		const entry = typeof node.type === 'string' ? byType.get(node.type) : undefined;
		if (!entry) continue;
		const props = isObj(node.props) ? node.props : {};
		for (const [name, field] of Object.entries(entry.props))
			if (field.required && props[name] === undefined)
				items.push({ code: 'missingProp', path: at, message: `${entry.type} needs prop \`${name}\`` });
		for (const name of Object.keys(props))
			if (!(name in entry.props))
				warnings.push({
					code: 'unknownProp',
					path: `${at}/props/${escapeToken(name)}`,
					message: `${entry.type} has no prop \`${name}\`; it is ignored`
				});
	}
	return report('props', items, warnings);
}

/** Two controls bound to one state path. With `widgets`, only input widgets count. */
function twoControlsItems(resolved: ResolvedNode[], where: Map<object, string>, widgets?: readonly SlimWidgetEntry[]) {
	const inputs = widgets && new Set(widgets.filter((w) => w.category === 'input').map((w) => w.type));
	const first = new Map<string, string>();
	const items: AuditItem[] = [];
	for (const node of resolved) {
		const at = node.source && where.get(node.source);
		if (!at || !node.bind || (inputs && !inputs.has(node.type))) continue;
		const other = first.get(node.bind.path);
		if (other === undefined) first.set(node.bind.path, at);
		else if (other !== at)
			items.push({
				code: 'twoControls',
				path: `${at}/bind`,
				message: `\`${node.bind.path}\` is already bound by ${other}; keep one control per value`
			});
	}
	return dedupe(items);
}

function sizeItems(spec: unknown): AuditItem[] {
	const bytes = new TextEncoder().encode(JSON.stringify(spec) ?? '').length;
	const link = Math.ceil((bytes * 4) / 3); // unpadded base64url
	return link > SHARE_CAP
		? [
				{
					code: 'tooLarge',
					path: '',
					message: `the share link would be ${link} chars, over the ${SHARE_CAP} cap; move bulk data to the host`
				}
			]
		: [];
}

const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g; // also inside 2026-12-25T10:00

/** ISO dates in `ui` and `state` more than a day after the caller's today. */
function futureDateItems(spec: Obj, now: { iso: string; tz: string }): AuditItem[] {
	const today = new Date(now.iso).toLocaleDateString('en-CA', { timeZone: now.tz }); // YYYY-MM-DD
	const [y, m, d] = today.split('-').map(Number);
	const limit = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
	const items: AuditItem[] = [];
	const scan = (value: unknown, at: string) => {
		if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${at}/${i}`));
		if (isObj(value)) {
			for (const [k, v] of Object.entries(value)) scan(v, `${at}/${escapeToken(k)}`);
			return;
		}
		if (typeof value !== 'string') return;
		for (const [date] of value.matchAll(ISO_DATE))
			if (date > limit)
				items.push({
					code: 'futureDate',
					path: at,
					message: `${date} is after today (${today}); use a given date, or mark a made-up card \`meta.sample: true\``
				});
	};
	scan(spec.ui, '/ui');
	scan(spec.state, '/state');
	return items;
}

/**
 * Every pure check over `spec`, one report each, in the order above. All
 * counts 0 means the spec parses, renders, reads its state cleanly and keeps
 * its data honest as far as a pure audit can tell. Pass the catalog as for
 * `validateCatalog`, or as `widgets`; with neither, only `if` and `each`
 * count as known.
 */
export function specAudit(spec: unknown, opts: SpecAuditOptions = {}): AuditReport<AuditItem>[] {
	const catalogOpts: ValidateCatalogOptions = {
		...opts,
		widgetTypes: opts.widgetTypes ?? opts.widgets?.map((w) => w.type)
	};
	const root = isObj(spec) ? spec : undefined;
	const nodes = root ? nodesOf(root.ui) : [];
	const state = root && isObj(root.state) ? root.state : {};

	const action = actionItems(nodes);
	const parsed = safeParseUISpec(spec);
	const schema: AuditItem[] = parsed.success
		? []
		: parsed.error.issues
				.map((issue) => ({ code: 'schema', path: toPointer(issue.path), message: issue.message }))
				.filter((i) => !(/\/on_/.test(i.path) && action.some((a) => a.path === i.path || a.path.startsWith(`${i.path}/`))));

	const catalog: AuditItem[] = root
		? validateCatalog(root as never, catalogOpts).map((node) => ({
				code: 'unknownWidget',
				path: catalogPointer(node.path),
				message: `widget type "${node.type}" isn't in the catalog`
			}))
		: [];

	// The resolved tree, against the seed state. A tree resolveTree cannot
	// walk is one leftover item: an unmeasured part fails.
	const where = new Map<object, string>(nodes.map(({ node, at }) => [node, at]));
	let resolved: ResolvedNode[] = [];
	let unresolved: AuditItem[] = [];
	if (nodes.length) {
		try {
			resolved = flatten(resolveTree(root!.ui as never, { state }).nodes);
		} catch (err) {
			unresolved = [{ code: 'leftover', path: '/ui', message: `the tree does not resolve (${String(err)})` }];
		}
	}
	const { thrown: expr, blank } = exprItems(resolved, where, state);
	const thrown = new Set(expr.map((i) => i.path));
	const leftover = [...unresolved, ...leftoverItems(resolved, where, thrown)];
	const flagged = new Set([...thrown, ...leftover.map((i) => i.path)]);
	leftover.push(...dedupe(blank.filter((i) => !flagged.has(i.path))));

	const reports = [
		report('schema', schema),
		report('catalog', catalog),
		report('action', action),
		report('envelope', root ? envelopeItems(root) : []),
		report('leftover', leftover),
		report('each', eachItems(nodes, state)),
		report('bind', bindItems(resolved, where)),
		report('expr', expr)
	];
	if (opts.widgets) reports.push(propsReport(nodes, opts.widgets));
	reports.push(report('twoControls', twoControlsItems(resolved, where, opts.widgets)));
	reports.push(report('size', sizeItems(spec)));
	if (opts.now) {
		const sample = root && isObj(root.meta) && root.meta.sample === true;
		reports.push(report('futureDate', root && !sample ? futureDateItems(root, opts.now) : []));
	}
	return reports;
}
