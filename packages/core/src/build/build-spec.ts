// @file build/build-spec.ts
// @description The build loop: a model writes a spec in rounds, the pure audit,
//   the data guard, the host's renderer and the host's critic check it, and
//   every fault goes back to the model as one feedback block until a round is
//   clean, stops improving, or a cap is hit. The model, renderer and critic are
//   injected functions; this module holds no provider, no keys and no I/O.
//   Invariants:
//   - Pure. No clock, no files, no DOM. Time comes in as `now`; the wall-clock
//     cap comes in as the caller's `signal`. An abort stops the loop with
//     `stopped: 'cap'` and the best round so far.
//   - Each round: model, parse (one trailing-comma retry), lossless fixes (an
//     envelope alias moved to `ui`), pure audit, data guard, renderer, critic.
//   - Score is 100 - 10 x faults - 2 x waived - critic penalty. Faults are the
//     pure and render audit items left after waivers; each critic issue marked
//     `fixable: 'spec'` costs 4, 8 or 12 by severity. `widget` issues cost
//     nothing and go to `widgetFaults`. An item a live waiver covers (same
//     check, on the waived widget, found through the item's path) moves to its
//     report's `waived` and to `Round.waived`: out of the count, still recorded.
//   - A round is accepted only when guard-clean and strictly better than the
//     best, so the returned spec is never worse than the first accepted round.
//     A round that does not parse is recorded but never returned. Clean = no
//     faults and no `spec` critic issue on a round the critic looked at.
//   - The data guard runs after the pure audit on every parsed round, against
//     the host's facts or the first parsed round. A round that fails it is
//     never accepted and never rendered: the loop stops `guard`, keeps the
//     best guard-clean round (null if there is none) and moves the conflict
//     to `widgetFaults`. There is no second bend.
//   - Token cap (`limits.tokens`, default 200k) is summed after every model
//     and critic call. A model call that crosses it leaves its round unrendered
//     and unaccepted; a critic call that crosses it ends the loop after that
//     round is scored (`clean` if it is, else `cap`). The best accepted round
//     is kept.
//   - Pre-gate: a round-1 spec that is one data widget (in single-child
//     wrappers) with clean audits gets one critic look and the loop stops:
//     `clean` when the critic is quiet, else `no-progress`.

import type { AuditItem, AuditReport } from '../core/audit-report.js';
import { dataGuard, dayAfter, type DataGuardResult, type Fact } from '../core/data-guard.js';
import { specAudit } from '../core/spec-audit.js';
import { formatSpecIssues } from '../core/spec-issues.js';
import type { ValidateCatalogOptions } from '../core/validate-catalog.js';
import type { SlimWidgetEntry } from '../manifest/slim.js';
import { craft as craftData, DATA_PROPS, waivers as craftWaivers, type CraftRule, type Lens, type Waiver } from '../manifest/craft.js';
import { specEnvelope } from '../manifest/envelope.js';

export type Preset = 'card' | 'figure';
export type StopReason = 'clean' | 'cap' | 'guard' | 'no-progress';

/** What the loop asks the model for on each round. The host turns it into a prompt. */
export interface ModelRequest {
	preset: Preset;
	/** The host's ask and rules, the same every round. */
	prompt: string;
	/** 1-based round number. */
	round: number;
	/** The best spec so far, for the model to fix; absent on round 1 or until a round parses. */
	prior?: unknown;
	/** The faults of the last round as one text block; `''` on round 1. */
	feedback: string;
	signal?: AbortSignal;
}

/** A model call. `tokens` is what the call cost; a host whose provider reports none counts before returning. */
export type Model = (req: ModelRequest) => Promise<{ text: string; tokens: number }>;

/** An offender's box on a render (CSS px from the shot's top left), for the critic to point at. */
export interface Box {
	/** The page check that found it, e.g. `overflow`. */
	check: string;
	/** JSON Pointer of the spec node it belongs to, when the host could map it. */
	path?: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** One render of the spec at one width and theme. */
export interface RenderResult {
	width: number;
	theme: string;
	/** Where the host put the screenshot (a path or URL), or null when nothing was shot. */
	png: string | null;
	/** The render checks for this shot; every item counts as a fault. */
	audit: AuditReport<AuditItem>[];
	boxes: Box[];
}

export type Renderer = (spec: unknown) => Promise<RenderResult[]>;

/** A finding from the host's critic (the eyes on the screenshots). */
export interface CriticIssue extends AuditItem {
	/** A `craft.lenses` id. */
	lens: string;
	/** The `craft.rules` id it breaks, when it names one. */
	rule?: string;
	/** The widget type at `path`, filled by the loop when it lands in `widgetFaults`. */
	widget?: string;
	severity: 1 | 2 | 3;
	/** `spec`: the model can fix it. `widget`: the widget is at fault, reported, not scored. */
	fixable: 'spec' | 'widget';
}

/** The craft data a critic judges by: rules with ids, and the lenses it looks through. */
export interface CriticRules {
	rules: readonly CraftRule[];
	lenses: readonly Lens[];
}

export type Critic = (req: {
	spec: unknown;
	renders: RenderResult[];
	rules: CriticRules;
	prompt: string;
	signal?: AbortSignal;
}) => Promise<{ issues: CriticIssue[]; tokens: number }>;

export interface BuildLimits {
	/** Round cap. Default 4. */
	rounds?: number;
	/** Model plus critic tokens per build. Default 200,000. */
	tokens?: number;
}

export interface BuildOptions extends ValidateCatalogOptions {
	preset: Preset;
	prompt: string;
	model: Model;
	renderer: Renderer;
	critic?: Critic;
	/** Slim widget entries for prop checks, the guard and the pre-gate. */
	widgets?: readonly SlimWidgetEntry[];
	/** The user's facts; the data guard's baseline when any is `given`, else the first parsed round. */
	facts?: readonly Fact[];
	/** Reviewed fault exceptions. Default: craft's `waivers`. */
	waivers?: readonly Waiver[];
	/** What the critic judges by. Default: core's `craft`. */
	craft?: CriticRules;
	/** The caller's clock: an ISO timestamp and an IANA zone. */
	now: { iso: string; tz: string };
	limits?: BuildLimits;
	signal?: AbortSignal;
	onRound?: (round: Round) => void;
}

export interface Round {
	n: number;
	/** The parsed spec, or null when the model's text was not JSON. */
	spec: unknown;
	/** Lossless fixes applied before the audit, in words. */
	fixed: string[];
	/** Pure audit, plus a `parse` report when the text did not parse. */
	audit: AuditReport<AuditItem>[];
	renders: RenderResult[];
	critic: CriticIssue[];
	/** Pure and render audit items left after waivers. */
	faults: number;
	/** What the `spec` critic issues cost (4, 8 or 12 each by severity). */
	penalty: number;
	score: number;
	accepted: boolean;
	/** True when round 1 took the pre-gate: one critic look, then stop. */
	preGate?: boolean;
	/** Items a waiver took out of the count. */
	waived: AuditItem[];
	/** The data guard's verdict; absent when the round did not parse. */
	guard?: DataGuardResult;
	/** Tokens this round's model and critic calls cost. */
	tokens: number;
	/** The feedback this round produced for the next one. */
	feedback: string;
}

export interface BuildResult {
	/** The best accepted spec, or null when no round parsed. */
	spec: unknown;
	rounds: Round[];
	/** Faults no spec can fix: the best round's `widget` critic issues and any guard conflict. */
	widgetFaults: CriticIssue[];
	stopped: StopReason;
	tokens: number;
}

const DEFAULT_ROUNDS = 4;
const DEFAULT_TOKENS = 200_000;

/** Drop each comma that only a `}` or `]` follows, outside strings: the one JSON slip models make that loses nothing. */
function dropTrailingCommas(text: string): string {
	let out = '';
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			if (c === '\\') {
				out += c + (text[++i] ?? '');
				continue;
			}
			if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) continue;
		out += c;
	}
	return out;
}

/** The model's text as a spec: a fenced block's body, or the outermost `{...}`; trailing commas forgiven. */
export function parseSpecText(text: string): { spec: unknown; fixed?: string } | { error: string } {
	const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
	let body = fenced ? fenced[1] : text;
	if (!fenced) {
		const start = body.indexOf('{');
		const end = body.lastIndexOf('}');
		if (start >= 0 && end > start) body = body.slice(start, end + 1);
	}
	try {
		return { spec: JSON.parse(body) };
	} catch (e) {
		try {
			return { spec: JSON.parse(dropTrailingCommas(body)), fixed: 'dropped trailing commas' };
		} catch {
			return { error: `the reply is not one JSON spec (${(e as Error).message})` };
		}
	}
}

/** Move a lone envelope alias (`root`, `tree`, ...) to `ui` when `ui` is missing. Mutates; returns what it did. */
function fixEnvelope(spec: unknown): string[] {
	if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return [];
	const s = spec as Record<string, unknown>;
	const found = specEnvelope.aliasesNotAllowed.filter((a) => typeof s[a] === 'object' && s[a] !== null);
	if ('ui' in s || found.length !== 1) return [];
	s.ui = s[found[0]];
	delete s[found[0]];
	return [`moved \`${found[0]}\` to \`ui\``];
}

class Aborted extends Error {}

/** The widget type of the spec node an item's path points into (`/ui/children/0/props/x` → that child's type). */
function widgetAt(spec: unknown, path: string): string | undefined {
	const node = /^\/ui((?:\/(?:children|else_children)\/\d+)*)/.exec(path);
	if (!node || typeof spec !== 'object' || spec === null) return undefined;
	let at: unknown = (spec as { ui?: unknown }).ui;
	for (const seg of node[1].split('/').slice(1)) at = (at as Record<string, unknown> | undefined)?.[seg];
	const type = (at as { type?: unknown } | undefined)?.type;
	return typeof type === 'string' ? type : undefined;
}

/** True when the spec's tree is one data widget, alone or inside single-child wrappers. */
function oneDataWidget(spec: unknown, widgets?: readonly SlimWidgetEntry[]): boolean {
	let node = (spec as { ui?: unknown } | null)?.ui as { type?: unknown; children?: unknown } | undefined;
	while (node && Array.isArray(node.children) && node.children.length === 1) node = node.children[0];
	const type = node?.type;
	if (typeof type !== 'string' || (Array.isArray(node?.children) && node.children.length > 0)) return false;
	const entry = widgets?.find((w) => w.type === type);
	return type in DATA_PROPS || Object.values(entry?.props ?? {}).some((p) => p?.data === true);
}

/**
 * Move each item a live waiver covers out of its report's count into
 * `waived`; returns the moved items. Matches by the item's path only.
 */
function waive(reports: AuditReport<AuditItem>[], spec: unknown, list: readonly Waiver[], day: string): AuditItem[] {
	const live = list.filter((w) => !w.until || w.until >= day);
	const moved: AuditItem[] = [];
	for (const r of reports) {
		const keep: AuditItem[] = [];
		for (const item of r.items) {
			const widget = live.some((w) => w.check === r.check) ? widgetAt(spec, item.path) : undefined;
			if (widget && live.some((w) => w.check === r.check && w.widget === widget)) moved.push(item);
			else keep.push(item);
		}
		if (keep.length === r.items.length) continue;
		r.waived = [...(r.waived ?? []), ...r.items.filter((i) => !keep.includes(i))];
		r.items = keep;
		r.count = keep.length;
	}
	return moved;
}

/** A critic issue as a feedback line: its lens and rule up front so the model can find the rule. */
const criticLine = (i: CriticIssue): AuditItem => ({
	code: i.rule ?? i.code,
	path: i.path,
	message: `[${i.lens}${i.rule ? `, rule:${i.rule}` : ''}] ${i.message}`
});

export async function buildSpec(opts: BuildOptions): Promise<BuildResult> {
	const { preset, prompt, model, renderer, critic, signal, onRound } = opts;
	const list = opts.waivers ?? craftWaivers;
	const rules = opts.craft ?? craftData;
	const day = dayAfter(opts.now).today; // in the caller's zone, as the guard reads it
	let first: unknown = undefined; // the first parsed spec, the guard's baseline without facts
	const cap = opts.limits?.rounds ?? DEFAULT_ROUNDS;
	const tokenCap = opts.limits?.tokens ?? DEFAULT_TOKENS;
	const rounds: Round[] = [];
	let best: Round | null = null;
	let widgetFaults: CriticIssue[] = [];
	let tokens = 0;
	let stopped: StopReason = 'cap';

	const check = () => {
		if (signal?.aborted) throw new Aborted();
	};
	/** Run a host call; an abort during it ends the loop (even if the call returns), any other error is the host's. */
	const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
		check();
		let r: T;
		try {
			r = await call();
		} catch (e) {
			if (signal?.aborted) throw new Aborted();
			throw e;
		}
		check();
		return r;
	};

	try {
		for (let n = 1; n <= cap; n++) {
			const last = rounds.at(-1);
			const reply = await guarded(() =>
				model({ preset, prompt, round: n, prior: best?.spec, feedback: last?.feedback ?? '', signal })
			);
			tokens += reply.tokens;
			const round: Round = {
				n,
				spec: null,
				fixed: [],
				audit: [],
				renders: [],
				critic: [],
				faults: 0,
				penalty: 0,
				score: 0,
				accepted: false,
				waived: [],
				tokens: reply.tokens,
				feedback: ''
			};
			const parsed = parseSpecText(reply.text);
			if ('error' in parsed) {
				round.audit = [{ check: 'parse', count: 1, items: [{ code: 'parse', path: '', message: parsed.error }] }];
			} else {
				round.spec = parsed.spec;
				round.fixed = [...(parsed.fixed ? [parsed.fixed] : []), ...fixEnvelope(parsed.spec)];
				round.audit = specAudit(parsed.spec, opts);
				round.waived = waive(round.audit, parsed.spec, list, day);
				if (first === undefined) first = parsed.spec;
				round.guard = dataGuard({ before: first, after: parsed.spec, facts: opts.facts, now: opts.now, widgets: opts.widgets });
			}
			if (round.guard && !round.guard.ok) {
				const items = round.audit.flatMap((r) => r.items);
				round.faults = items.length;
				round.score = 100 - 10 * round.faults - 2 * round.waived.length;
				round.feedback = formatSpecIssues([...round.guard.items, ...items]);
				rounds.push(round);
				widgetFaults = [
					...widgetFaults,
					...round.guard.items.map(
						(i): CriticIssue => ({
							...i,
							lens: 'data-truth',
							rule: i.code === 'inventedDate' ? 'no-future-dates' : 'data-fixed',
							severity: 3,
							fixable: 'widget'
						})
					)
				];
				onRound?.(round);
				stopped = 'guard';
				break;
			}
			// Over the token cap after the model call: no render or critic spend, so the round is never accepted.
			const looked = round.spec !== null && tokens < tokenCap;
			if (looked) {
				const spec = round.spec;
				round.renders = await guarded(() => renderer(spec));
				for (const r of round.renders) round.waived.push(...waive(r.audit, spec, list, day));
				if (critic) {
					const seen = await guarded(() => critic({ spec, renders: round.renders, rules, prompt, signal }));
					tokens += seen.tokens;
					round.tokens += seen.tokens;
					round.critic = seen.issues.map((i) => (i.fixable === 'widget' ? { ...i, widget: i.widget ?? widgetAt(spec, i.path) } : i));
				}
			}

			const items: AuditItem[] = [
				...round.audit.flatMap((r) => r.items),
				...round.renders.flatMap((r) =>
					r.audit.flatMap((a) => a.items.map((i) => ({ ...i, message: `[${r.width}-${r.theme}] ${i.message}` })))
				)
			];
			const specIssues = round.critic.filter((i) => i.fixable === 'spec');
			round.faults = items.length;
			round.penalty = specIssues.reduce((sum, i) => sum + 4 * i.severity, 0);
			round.score = 100 - 10 * round.faults - 2 * round.waived.length - round.penalty;
			round.feedback = formatSpecIssues([...items, ...specIssues.map(criticLine)]);
			round.accepted = looked && (!best || round.score > best.score);
			const isClean = looked && round.faults === 0 && specIssues.length === 0;
			if (n === 1 && looked && round.faults === 0 && oneDataWidget(round.spec, opts.widgets)) round.preGate = true;
			rounds.push(round);
			if (round.accepted) {
				best = round;
				widgetFaults = round.critic.filter((i) => i.fixable === 'widget');
			}
			onRound?.(round);

			if (round.accepted && isClean) {
				stopped = 'clean';
				break;
			}
			if (tokens >= tokenCap) {
				stopped = 'cap';
				break;
			}
			if (round.preGate) {
				stopped = 'no-progress';
				break;
			}
			if (best && round.spec !== null && !round.accepted) {
				stopped = 'no-progress';
				break;
			}
		}
	} catch (e) {
		if (!(e instanceof Aborted)) throw e;
		stopped = 'cap';
	}

	return { spec: best?.spec ?? null, rounds, widgetFaults, stopped, tokens };
}
