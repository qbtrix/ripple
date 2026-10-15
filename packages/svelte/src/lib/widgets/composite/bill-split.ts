// widgets/composite/bill-split.ts: the pure half of the `bill-split` data
// widget. Prop hygiene (model output in, clean BillValue out) and the split.
//
// Model output is messy, so every parser here never throws: money arrives as
// 12.5, "12.50" or "$1,240.50", a tip as "20%", a person as a bare string.
// Junk drops out (a null person is not a person, a 150% tip option is not a
// chip) instead of being clamped into something that looks real.
//
// The split works in integer minor units of the currency (cents for USD, yen
// for JPY, fils for BHD; `minorDigits`). Each person's weight is their even
// part of the shared amount plus what they had on top (extras), so tax and
// tip follow what each person ordered. Every share is floored and the
// leftover units go to the first people, so the shares always add up to the
// total exactly. Tax sits ON TOP of `subtotal` (the pre-tax bill); the tip is
// a percent of the pre-tax subtotal. Extras that add up to more than the bill
// raise the bill to their sum, and `over` says so.
import { finite, plain } from '../data-kit/format.js';

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 12;
export const MAX_TIP = 100;
export const DEFAULT_TIP = 18;
export const DEFAULT_TIP_OPTIONS = [15, 18, 20, 22];

export interface Person {
	id: string;
	name: string;
	/** What this person had on top of the shared part, e.g. drinks. */
	extras: number;
}

/** The bound value: everything the visitor can edit. */
export interface BillValue {
	subtotal: number;
	tip_percent: number;
	people: Person[];
}

export interface Share extends Person {
	/** What this person pays, tip and tax included, in minor units. */
	cents: number;
	/** The tip and tax inside `cents`: the share minus their even part and extras. */
	added: number;
}

export interface Split {
	shares: Share[];
	/** Minor units. The bill the split used: subtotal (raised to the extras if they exceed it). */
	subtotal: number;
	tax: number;
	tip: number;
	/** subtotal + tax + tip, and exactly the sum of the shares. */
	total: number;
	/** Extras added up to more than the subtotal. */
	over: boolean;
}

/** A number, or a string like "12.50", "$8" or "$1,240.50"; anything else is undefined. */
export function toAmount(v: unknown): number | undefined {
	if (typeof v !== 'string') return finite(v);
	const m = /^[^\d.-]{0,4}(-?(?:\d+\.?\d*|\.\d+))$/.exec(v.replace(/[\s,]/g, ''));
	return m ? finite(m[1]) : undefined;
}

const amount = (v: unknown) => Math.max(0, toAmount(v) ?? 0);

/** A tip percent from 18 or "20%", clamped to 0..100; junk is undefined. */
export const clampTip = (v: unknown): number | undefined => {
	const n = typeof v === 'string' ? finite(v.trim().replace(/\s*%$/, '')) : finite(v);
	return n === undefined ? undefined : Math.min(Math.max(n, 0), MAX_TIP);
};

/** Decimal places of the currency's minor unit (USD 2, JPY 0, BHD 3); a bad code counts as USD. */
export function minorDigits(currency: unknown): number {
	const code = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

/** People entries worth keeping: objects (not arrays) and strings, which become a name. */
const valid = (raw: unknown): Array<Record<string, unknown>> =>
	Array.isArray(raw)
		? raw.flatMap((p) => (typeof p === 'string' ? [{ name: p }] : p !== null && typeof p === 'object' && !Array.isArray(p) ? [p as Record<string, unknown>] : []))
		: [];

/** How many real people the model sent, before the 12 cap. */
export const countPeople = (raw: unknown): number => valid(raw).length;

/** Model or bound people: at most 12, unique ids, a name, extras >= 0. */
export function toPeople(raw: unknown): Person[] {
	const seen = new Set<string>();
	const out: Person[] = [];
	for (const [i, o] of valid(raw).slice(0, MAX_PEOPLE).entries()) {
		let id = typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id).trim() : '';
		if (!id || seen.has(id)) id = nextId([...seen], i + 1);
		seen.add(id);
		out.push({ id, name: plain(o.name) || `Person ${i + 1}`, extras: amount(o.extras) });
	}
	return out;
}

/** A fresh `pN` id, starting from `from`, that no one has yet. */
export function nextId(ids: readonly string[], from = ids.length + 1): string {
	let k = from;
	while (ids.includes(`p${k}`)) k++;
	return `p${k}`;
}

/** Tip chips: 0..100 only (the rest dropped, not clamped), deduped, ascending, at most 6. */
export function toTipOptions(raw: unknown): number[] {
	const list = Array.isArray(raw) ? raw.map(finite).filter((n): n is number => n !== undefined && n >= 0 && n <= MAX_TIP) : [];
	const clean = [...new Set(list)].sort((a, b) => a - b).slice(0, 6);
	return clean.length ? clean : DEFAULT_TIP_OPTIONS;
}

/** A clean BillValue from model props or a bound value; undefined until there is a bill and a person. */
export function toValue(raw: { subtotal?: unknown; tip_percent?: unknown; people?: unknown }): BillValue | undefined {
	const sub = toAmount(raw.subtotal);
	const people = toPeople(raw.people);
	if (sub === undefined || !people.length) return undefined;
	return { subtotal: Math.max(0, sub), tip_percent: clampTip(raw.tip_percent) ?? DEFAULT_TIP, people };
}

/** Split a bill. Every amount out is in minor units (`digits` places); the shares add up to `total`. */
export function split(v: BillValue, tax: unknown = 0, digits = 2): Split {
	const unit = 10 ** digits;
	const minor = (x: unknown) => Math.round(amount(x) * unit);
	const n = v.people.length;
	const ex = v.people.map((p) => minor(p.extras));
	const extras = ex.reduce((a, b) => a + b, 0);
	const given = minor(v.subtotal);
	const subtotal = Math.max(given, extras);
	const taxM = minor(tax);
	const tip = Math.round((subtotal * (clampTip(v.tip_percent) ?? 0)) / 100);
	const total = subtotal + taxM + tip;
	const shared = subtotal - extras;
	// n * (shared / n + extras_i): integer weights that sum to n * subtotal.
	const w = ex.map((e) => shared + n * e);
	const W = w.reduce((a, b) => a + b, 0);
	const pay = w.map((x) => (W ? Math.floor((total * x) / W) : 0));
	if (!W && n) pay[0] = total;
	const left = total - pay.reduce((a, b) => a + b, 0);
	if (n) for (let i = 0; i < left; i++) pay[i % n]++;
	return {
		shares: v.people.map((p, i) => ({ ...p, cents: pay[i], added: Math.max(0, Math.round(pay[i] - w[i] / n)) })),
		subtotal,
		tax: taxM,
		tip,
		total,
		over: extras > given
	};
}
