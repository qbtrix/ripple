// @file build/build-spec.ts
// @description The build loop: a model writes a spec in rounds, the pure audit
//   and the host's renderer check it, and every fault goes back to the model
//   as one feedback block until a round is clean, stops improving, or the
//   round cap is hit. The model, renderer and critic are injected functions;
//   this module holds no provider, no keys and no I/O.
//   Invariants:
//   - Pure. No clock, no files, no DOM. Time comes in as `now`; the wall-clock
//     cap comes in as the caller's `signal`. An abort stops the loop with
//     `stopped: 'cap'` and the best round so far.
//   - A round is accepted only when its score beats the best strictly, so the
//     returned spec is never worse than the first accepted round. A round that
//     does not parse is recorded but never returned.
//   - Score is 100 - 10 x faults - 2 x waived. Faults are every pure audit
//     item, every render audit item and every critic issue marked
//     `fixable: 'spec'`; `widget` issues go to `widgetFaults` and cost nothing.
//     An item a live waiver covers (same check, on the waived widget, found
//     through the item's path) moves to its report's `waived` and to
//     `Round.waived`: out of the count, still in the record.
//   - The data guard runs after the pure audit on every parsed round, against
//     the host's facts or the first parsed round. A round that fails it is
//     never accepted and never rendered: the loop stops `guard`, keeps the
//     best guard-clean round (null if there is none) and moves the conflict
//     to `widgetFaults`. There is no second bend.

import type { AuditItem, AuditReport } from '../core/audit-report.js';
import { dataGuard, type DataGuardResult, type Fact } from '../core/data-guard.js';
import { specAudit } from '../core/spec-audit.js';
import { formatSpecIssues } from '../core/spec-issues.js';
import type { ValidateCatalogOptions } from '../core/validate-catalog.js';
import type { SlimWidgetEntry } from '../manifest/slim.js';
import { waivers as craftWaivers, type Waiver } from '../manifest/craft.js';

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

/** An offender's box on a render, for the critic to point at. */
export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
	code?: string;
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
	lens: string;
	severity: 1 | 2 | 3;
	/** `spec`: the model can fix it. `widget`: the widget is at fault, reported, not scored. */
	fixable: 'spec' | 'widget';
}

export type Critic = (req: {
	spec: unknown;
	renders: RenderResult[];
	prompt: string;
	signal?: AbortSignal;
}) => Promise<{ issues: CriticIssue[]; tokens: number }>;

export interface BuildLimits {
	/** Round cap. Default 4. */
	rounds?: number;
}

export interface BuildOptions extends ValidateCatalogOptions {
	preset: Preset;
	prompt: string;
	model: Model;
	renderer: Renderer;
	critic?: Critic;
	/** Slim widget entries for prop checks (used by later audit checks). */
	widgets?: readonly SlimWidgetEntry[];
	/** The user's facts; the data guard's baseline when any is `given`, else the first parsed round. */
	facts?: readonly Fact[];
	/** Reviewed fault exceptions. Default: craft's `waivers`. */
	waivers?: readonly Waiver[];
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
	/** Pure audit, plus a `parse` report when the text did not parse. */
	audit: AuditReport<AuditItem>[];
	renders: RenderResult[];
	critic: CriticIssue[];
	faults: number;
	score: number;
	accepted: boolean;
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
	widgetFaults: CriticIssue[];
	stopped: StopReason;
	tokens: number;
}

const DEFAULT_ROUNDS = 4;

/** The model's text as a spec: a fenced block's body, or the outermost `{...}`. */
export function parseSpecText(text: string): { spec: unknown } | { error: string } {
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
		return { error: `the reply is not one JSON spec (${(e as Error).message})` };
	}
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

/**
 * Move each item a live waiver covers out of its report's count into
 * `waived`; returns the moved items. Matches by the item's path only.
 * ponytail: render items carry path '' until the page audit reports offender
 * paths (CL-5 boxes), so render waivers bite from then on.
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

export async function buildSpec(opts: BuildOptions): Promise<BuildResult> {
	const { preset, prompt, model, renderer, critic, signal, onRound } = opts;
	const list = opts.waivers ?? craftWaivers;
	const day = opts.now.iso.slice(0, 10);
	let first: unknown = undefined; // the first parsed spec, the guard's baseline without facts
	const cap = opts.limits?.rounds ?? DEFAULT_ROUNDS;
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
				audit: [],
				renders: [],
				critic: [],
				faults: 0,
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
					...round.guard.items.map((i): CriticIssue => ({ ...i, lens: 'data truth', severity: 3, fixable: 'widget' }))
				];
				onRound?.(round);
				stopped = 'guard';
				break;
			}
			if (round.spec !== null) {
				const spec = round.spec;
				round.renders = await guarded(() => renderer(spec));
				for (const r of round.renders) round.waived.push(...waive(r.audit, spec, list, day));
				if (critic) {
					const seen = await guarded(() => critic({ spec, renders: round.renders, prompt, signal }));
					tokens += seen.tokens;
					round.tokens += seen.tokens;
					round.critic = seen.issues;
				}
			}

			const items: AuditItem[] = [
				...round.audit.flatMap((r) => r.items),
				...round.renders.flatMap((r) =>
					r.audit.flatMap((a) => a.items.map((i) => ({ ...i, message: `[${r.width}-${r.theme}] ${i.message}` })))
				),
				...round.critic.filter((i) => i.fixable === 'spec')
			];
			round.faults = items.length;
			round.score = 100 - 10 * round.faults - 2 * round.waived.length;
			round.feedback = formatSpecIssues(items);
			round.accepted = round.spec !== null && (!best || round.score > best.score);
			rounds.push(round);
			if (round.accepted) {
				best = round;
				widgetFaults = round.critic.filter((i) => i.fixable === 'widget');
			}
			onRound?.(round);

			if (round.accepted && round.faults === 0) {
				stopped = 'clean';
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
