// widgets/composite/cover-art.ts: shared reading and cover art for the catalog
// widgets (place-results, product-grid, media-grid). Covers are generated (a
// gradient from music-player's palette, picked by `color` or by a hash of the
// name) so a card looks finished with no image: public cards may not load
// arbitrary image hosts. Pure functions, no DOM.
import { finite, plain } from '../data-kit/index.js';
import { PALETTE } from './MusicPlayer.svelte';

export { PALETTE };
const NAMES = Object.keys(PALETTE);

export function hashOf(s: string): number {
	let h = 0;
	for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
	return Math.abs(h);
}

/** A palette name the model chose, else a stable pick from the seed. */
export function paletteFor(color: unknown, seed: string): [string, string] {
	const named = typeof color === 'string' ? PALETTE[color.toLowerCase()] : undefined;
	return named ?? PALETTE[NAMES[hashOf(seed) % NAMES.length]];
}

export const grad = (p: [string, string]) => `linear-gradient(135deg, ${p[0]}, ${p[1]})`;

export const initials = (s: string) =>
	s
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => [...w][0])
		.join('')
		.toUpperCase();

export const text = (v: unknown, max: number) => plain(v).trim().slice(0, max);

/** A number within [min, max], else undefined. */
export function within(v: unknown, min: number, max: number): number | undefined {
	const n = finite(v);
	return n !== undefined && n >= min && n <= max ? n : undefined;
}

/** Plain short strings from a model list, deduped, capped. */
export function words(v: unknown, max = 6, len = 24): string[] {
	if (!Array.isArray(v)) return [];
	const out = new Set<string>();
	for (const w of v) {
		const t = text(w, len);
		if (t) out.add(t);
	}
	return [...out].slice(0, max);
}

/** Model rows: objects only, capped, each with a unique key (its id, or its index). */
export function rows<T extends Record<string, unknown>>(v: unknown, cap: number): (T & { key: string })[] {
	if (!Array.isArray(v)) return [];
	const seen = new Set<string>();
	const out: (T & { key: string })[] = [];
	v.forEach((r, i) => {
		if (!r || typeof r !== 'object' || Array.isArray(r) || out.length >= cap) return;
		const raw = typeof (r as T).id === 'string' && (r as T).id ? String((r as T).id) : `r${i}`;
		const key = seen.has(raw) ? `${raw}-${i}` : raw;
		seen.add(key);
		out.push({ ...(r as T), key });
	});
	return out;
}

export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
