// widgets/composite/pipeline-dashboard.ts: every data rule behind the
// `pipeline-dashboard` widget, pure and DOM-free so it is unit-tested alone.
// The component only lays out what these functions return.
//
// Props are model output, so nothing here throws: arrays go through
// safeArray, text through plain(), numbers may arrive as "$1,200,000" or
// "1,240". The quota reads a currency from '$', 'usd' or 'EUR' (no dollar
// default), compacts amounts once the quota reaches 10,000, and never shows
// a percent without a usable target. Ranks follow `position` only when every
// leader has one. Conversion rates read fractions (0.225) and "28.6%"
// strings; a row without a number drops. Deal cells become display text
// (numbers stay numbers so Table still right-aligns them, except in a column
// set to align right, where they read as grouped or money text) and empty rows
// drop. Money text in leaders and deals reads like the quota: "$420k" takes
// money()'s upper-case suffix ("$420K") and "¥812,400,000" compacts ("¥812.4M").
import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';
import { finite, money, num, plain } from '../data-kit/format.js';
import { parseValue } from '../data/funnel-math.js';

const SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
const COMPACT_FROM = 10_000;

export interface Currency {
	/** ISO 4217 code for Intl. */
	code?: string;
	/** An unknown symbol, printed before a plain number. */
	prefix?: string;
}

/** '$' → USD, 'usd' → USD, '₩' → prefix '₩', absent → plain numbers. */
export function readCurrency(v: unknown): Currency {
	const s = plain(v);
	if (!s) return {};
	if (SYMBOLS[s]) return { code: SYMBOLS[s] };
	if (/^[a-z]{3}$/i.test(s)) return { code: s.toUpperCase() };
	return { prefix: s };
}

/** A non-negative number from a number or "$1,200,000"-style text, else undefined. */
export function amount(v: unknown): number | undefined {
	if (typeof v !== 'string') return parseValue(v);
	return parseValue(v.trim().replace(/^[^\d.+-]+/, ''));
}

/** An amount in the currency; compact ("$1.8M") only when asked. */
export function fmtAmount(n: number, cur: Currency, compact: boolean): string {
	if (cur.code) return money(n, cur.code, compact ? { compact: true } : { whole: true });
	return `${cur.prefix ?? ''}${num(n, { compact, digits: compact ? 1 : 0 })}`;
}

/** "$420k" / "+$40k" → "$420K" / "+$40K", matching money()'s compact suffix; other text is unchanged. */
export const suffixCase = (s: string) => s.replace(/^([+\-−]?[$€£¥₹]\s?[\d.,]+)([kmb])$/i, (_, n: string, k: string) => n + k.toUpperCase());

/** Money text the way the quota prints it: "¥812,400,000" → "¥812.4M" from 10,000 up, "$420k" → "$420K"; other text is unchanged. */
export function moneyText(s: string): string {
	const m = /^([+\-−]?)([$€£¥₹])\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(s);
	const n = m ? Number(m[3].replaceAll(',', '') + (m[4] ?? '')) : NaN;
	return m && n >= COMPACT_FROM ? m[1] + money(n, SYMBOLS[m[2]], { compact: true }) : suffixCase(s);
}

/** Whole percent, except 99.5 to just under 100 reads 99 (never 100 before the target). */
export function pctLabel(p: number): string {
	if (p >= 99.5 && p < 100) return '99%';
	return `${Math.round(p)}%`;
}

export interface QuotaView {
	label: string;
	period: string;
	current: string;
	/** Present only with a usable target (finite and above 0). */
	target?: string;
	pct?: number;
	pctText?: string;
	/** '$680K to go', '€6.2K over target' or 'Target reached'. */
	foot?: string;
	met?: boolean;
}

export function readQuota(raw: unknown): QuotaView | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const q = raw as Record<string, unknown>;
	const cur = amount(q.current);
	if (cur === undefined) return undefined;
	const goal = amount(q.target);
	const c = readCurrency(q.currency);
	const compact = Math.max(cur, goal ?? 0) >= COMPACT_FROM;
	const f = (n: number) => fmtAmount(n, c, compact);
	const base = { label: plain(q.label) || (goal ? 'Target' : 'Progress'), period: plain(q.period), current: f(cur) };
	if (!goal) return base;
	const pct = (cur / goal) * 100;
	const met = cur >= goal;
	const foot = cur === goal ? 'Target reached' : met ? `${f(cur - goal)} over target` : `${f(goal - cur)} to go`;
	return { ...base, target: f(goal), pct, pctText: pctLabel(pct), foot, met };
}

export interface Leader {
	key: string;
	rank: number;
	name: string;
	avatar?: string;
	/** Display value; undefined shows a muted n/a. */
	value?: string;
	delta?: string;
	dir: 'up' | 'down' | 'neutral';
	sublabel: string;
}

/** Ranked rows: by `position` when every row has one (ties share a rank), else input order. */
export function readLeaders(items: unknown, cur: Currency = {}): Leader[] {
	const rows = safeArray<unknown>(items).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
	const pos = rows.map((r) => finite(r.position));
	const byPos = rows.length > 0 && pos.every((p) => p !== undefined);
	const order = rows.map((r, i) => ({ r, p: pos[i]!, i }));
	if (byPos) order.sort((a, b) => a.p - b.p || a.i - b.i);
	const keys = uniqueKeys(order, (o) => plain(o.r.name) || 'unnamed');
	return order.map(({ r, p }, i) => {
		const v = r.value;
		const n = typeof v === 'number' ? amount(v) : undefined;
		const text = typeof v === 'string' ? moneyText(plain(v)) : '';
		const value = n !== undefined ? fmtAmount(n, cur, n >= COMPACT_FROM) : text || undefined;
		const delta = moneyText(plain(r.delta));
		const avatar = plain(r.avatar);
		return {
			key: keys[i],
			rank: byPos ? p : i + 1,
			name: plain(r.name),
			avatar: avatar || undefined,
			value,
			delta: delta || undefined,
			dir: delta.startsWith('+') ? 'up' : /^[-−]/.test(delta) ? 'down' : 'neutral',
			sublabel: plain(r.sublabel)
		};
	});
}

/** Stages with a number; two or more make a usable funnel (conversion then is not drawn). */
export function funnelStages(funnel: unknown): { label: string; value: number }[] {
	const f = funnel && typeof funnel === 'object' ? (funnel as Record<string, unknown>) : {};
	return safeArray<{ label: string; value: number }>(f.stages).filter((s) => !!s && typeof s === 'object');
}
export const usableFunnel = (stages: readonly { value?: unknown }[]) =>
	stages.filter((s) => parseValue(s.value) !== undefined).length >= 2;

export interface Rate {
	key: string;
	from: string;
	to: string;
	pct: number;
	text: string;
	lowest: boolean;
}

/** A rate in percent: 41, "28.6%", or a fraction 0.225 written without %. */
export function ratePct(v: unknown): number | undefined {
	if (typeof v === 'string') {
		const s = v.trim();
		const n = finite(s.replace(/%$/, '').trim());
		if (n === undefined) return undefined;
		return s.endsWith('%') || n > 1 ? n : n * 100;
	}
	const n = finite(v);
	return n === undefined ? undefined : n > 1 ? n : n * 100;
}

export function readRates(conversion: unknown): Rate[] {
	const rows = safeArray<unknown>(conversion)
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
		.map((r) => ({ from: plain(r.from), to: plain(r.to), pct: ratePct(r.rate) }))
		.filter((r): r is { from: string; to: string; pct: number } => r.pct !== undefined && !!(r.from || r.to));
	const low = rows.length > 1 ? Math.min(...rows.map((r) => r.pct)) : undefined;
	const keys = uniqueKeys(rows, (r) => `${r.from}>${r.to}`);
	let marked = false;
	return rows.map((r, i) => {
		const lowest = !marked && r.pct === low;
		if (lowest) marked = true;
		return { ...r, key: keys[i], text: `${num(r.pct, { digits: 1 })}%`, lowest };
	});
}

/** One deal cell as display text: arrays join, objects show label/name/title/value, null is empty. */
export function cellText(v: unknown): string | number {
	if (v === null || v === undefined) return '';
	if (typeof v === 'number') return Number.isFinite(v) ? v : '';
	if (Array.isArray(v)) return v.map(cellText).filter((x) => x !== '').join(', ');
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		for (const k of ['label', 'name', 'title', 'value']) {
			const t = cellText(o[k]);
			if (t !== '' && (typeof o[k] !== 'object' || o[k] === null)) return t;
		}
		return '';
	}
	return moneyText(plain(v));
}

export interface DealColumn {
	key: string;
	label: string;
	align?: 'left' | 'right' | 'center';
}

/**
 * Columns (from `columns`, else the first row's keys) and display rows; empty
 * rows drop. A number in a right-aligned column becomes text: money when the
 * column's other cells carry a currency symbol (in the dashboard's currency,
 * else that symbol), grouped digits otherwise. An empty first cell stays empty; Table marks it Untitled.
 */
export function readDeals(deals: unknown, cur: Currency = {}): { title: string; columns: DealColumn[]; rows: Record<string, string | number>[] } {
	const d = deals && typeof deals === 'object' ? (deals as Record<string, unknown>) : {};
	const raw = safeArray<unknown>(d.rows).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
	let columns: DealColumn[] = safeArray<unknown>(d.columns)
		.map((c): DealColumn | undefined => {
			if (typeof c === 'string') return c ? { key: c, label: c } : undefined;
			if (!c || typeof c !== 'object') return undefined;
			const o = c as Record<string, unknown>;
			const key = plain(o.key ?? o.accessorKey);
			if (!key) return undefined;
			const align = o.align === 'left' || o.align === 'right' || o.align === 'center' ? o.align : undefined;
			return { key, label: plain(o.label ?? o.header) || key, align };
		})
		.filter((c): c is DealColumn => !!c);
	if (!columns.length && raw[0]) columns = Object.keys(raw[0]).map((k) => ({ key: k, label: k }));
	const rows = raw
		.map((r) => Object.fromEntries(columns.map((c) => [c.key, cellText(r[c.key])])))
		.filter((r) => Object.values(r).some((v) => v !== ''));
	for (const c of columns) {
		if (c.align !== 'right') continue;
		const sym = rows.map((r) => r[c.key]).find((v): v is string => typeof v === 'string' && /[$€£¥₹]/.test(v))?.match(/[$€£¥₹]/)?.[0];
		const cc = !sym ? undefined : cur.code || cur.prefix ? cur : readCurrency(sym);
		for (const r of rows) {
			const n = r[c.key];
			if (typeof n === 'number') r[c.key] = cc ? fmtAmount(n, cc, n >= COMPACT_FROM) : num(n);
		}
	}
	return { title: plain(d.title), columns, rows };
}

export interface Event {
	key: string;
	label: string;
	actor: string;
	time: string;
	icon: string;
}

/** Activity rows; a row with no label says nothing and drops. */
export function readTicker(ticker: unknown): Event[] {
	const rows = safeArray<unknown>(ticker)
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
		.map((t) => ({ label: plain(t.label), actor: plain(t.actor), time: plain(t.time), icon: plain(t.icon) }))
		.filter((t) => t.label);
	const keys = uniqueKeys(rows, (t) => t.label);
	return rows.map((t, i) => ({ ...t, key: keys[i] }));
}

/** "Show 5 more" / "Show 16 earlier": always the hidden count, never "Show all". */
export const moreLabel = (total: number, cap: number, noun = 'more') => `Show ${total - cap} ${noun}`;
