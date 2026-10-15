// research/sources.ts: the data half of sources-bar. Model output is messy
// (numbers and objects as names, bare strings as entries, schemeless or
// `javascript:` URLs, a count that disagrees with the list), so every rule
// for turning `sources` / `count` / `label` into what the bar shows lives
// here as pure functions that never throw. The component only lays it out.
//
// Rules worth knowing before you change one:
// - A source links only when its URL is absolute http(s) after normalisation.
//   A schemeless URL whose first segment has a dot gets https:// prefixed;
//   anything else (a relative path, `javascript:`, `mailto:`) stays plain.
// - Duplicates are kept: two rows with the same name are two citations.
// - displayCount is max(valid entries, count); a smaller, negative or
//   non-numeric count is ignored, never printed raw.
import { safeUrl } from '@ripple-ui/core';
import { finite, plain } from '$lib/widgets/data-kit/format.js';

export interface SourceView {
	/** Display name: plain text, or the hostname when the name is itself a URL. */
	name: string;
	/** Full text for the `title` tooltip. */
	title: string;
	/** Absolute http(s) URL, only when the source is linkable. */
	href?: string;
	/** Hostname with a leading www. stripped, when linkable. */
	host?: string;
	/** Model-supplied favicon (a string; the template still runs it through safeUrl). */
	favicon?: string;
	/** Model-supplied colour, used as the mark's tint hue. */
	color?: string;
	/** First grapheme for the letter mark. */
	initial: string;
}

export interface SourcesModel {
	items: SourceView[];
	displayCount: number;
	label: string;
	/** Count the bar claims but does not list ("and 43 more not listed"). */
	unlisted: number;
	/** True when there is a usable `count` but no listable entry. */
	countOnly: boolean;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const str = (v: unknown): string | undefined => {
	if (typeof v !== 'string') return undefined;
	const s = v.trim();
	return s === '' ? undefined : s;
};

/** An absolute http(s) URL from a model-written url, else undefined. */
export function linkable(v: unknown): string | undefined {
	let s = str(v);
	if (!s || /\s/.test(s)) return undefined;
	if (!SCHEME.test(s)) {
		const first = s.split(/[/?#]/, 1)[0];
		if (!first.includes('.') || s.startsWith('/') || s.startsWith('.')) return undefined;
		s = `https://${s}`;
	}
	const safe = safeUrl(s, { kind: 'link' });
	if (!safe) return undefined;
	try {
		const u = new URL(safe);
		return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? safe : undefined;
	} catch {
		return undefined;
	}
}

/** Hostname of an absolute URL with a leading www. stripped. */
export function hostOf(href: string): string {
	try {
		return new URL(href).hostname.replace(/^www\./i, '');
	} catch {
		return href;
	}
}

function graphemes(s: string): string[] {
	const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
	if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (g) => g.segment);
	return Array.from(s);
}

const READABLE = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

/** First readable grapheme: a letter, digit or emoji, never a lone quote or bracket. */
export function initialOf(name: string): string {
	const gs = graphemes(name.trim());
	const g = gs.find((x) => READABLE.test(x)) ?? gs[0] ?? '';
	return g.toUpperCase();
}

/** A colour string safe to drop into one inline declaration. */
function colorOf(v: unknown): string | undefined {
	const s = str(v);
	if (!s || !/^[#\w\s(),.%/+-]+$/.test(s) || /url\(|expression\(/i.test(s)) return undefined;
	// Inside color-mix() with var() an unknown colour would void the whole fill,
	// so where the browser can tell, an unknown one falls back to the name tint.
	return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', s) ? undefined : s;
}

function nameOf(v: unknown): string | undefined {
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : undefined;
	if (typeof v !== 'string') return undefined;
	const s = plain(v);
	return s === '' ? undefined : s;
}

function toView(entry: unknown): SourceView | undefined {
	const e: Record<string, unknown> =
		typeof entry === 'string' || typeof entry === 'number'
			? { name: entry }
			: entry && typeof entry === 'object' && !Array.isArray(entry)
				? Object.fromEntries(Object.entries(entry))
				: {};
	const href = linkable(e.url);
	let name = nameOf(e.name);
	let title = name ?? '';
	if (name && /^(https?:\/\/|www\.)/i.test(name)) {
		const asUrl = linkable(name);
		if (asUrl) name = hostOf(asUrl);
	}
	if (!name && href) {
		name = hostOf(href);
		title = href;
	}
	if (!name) return undefined;
	return {
		name,
		title: title || name,
		href,
		host: href ? hostOf(href) : undefined,
		favicon: str(e.favicon),
		color: colorOf(e.color),
		initial: initialOf(name)
	};
}

/** Everything the bar shows, from raw props. Never throws. */
export function sourcesModel(sources: unknown, count?: unknown, label?: unknown): SourcesModel {
	const items = (Array.isArray(sources) ? sources : [])
		.map(toView)
		.filter((s): s is SourceView => !!s);
	const c = finite(count);
	const claimed = c !== undefined && c > 0 ? Math.floor(c) : 0;
	const displayCount = Math.max(items.length, claimed);
	const custom = typeof label === 'string' ? label.trim() : '';
	return {
		items,
		displayCount,
		label: custom || (displayCount === 1 ? 'source' : 'sources'),
		unlisted: displayCount - items.length,
		countOnly: items.length === 0 && displayCount > 0
	};
}

/** Accessible name of the summary: "12 sources: A, B, C and 9 more". */
export function summaryName(m: SourcesModel, shown = 3): string {
	const head = m.items.slice(0, shown).map((s) => s.name);
	const rest = m.displayCount - head.length;
	const list = head.join(', ') + (rest > 0 ? ` and ${rest} more` : '');
	return `${m.displayCount} ${m.label}${list ? `: ${list}` : ''}`;
}

/** Copy and share text: one numbered line per listed source, "1. Name, url". */
export function copyText(items: readonly SourceView[]): string {
	return items.map((s, i) => `${i + 1}. ${s.name}${s.href ? `, ${s.href}` : ''}`).join('\n');
}
