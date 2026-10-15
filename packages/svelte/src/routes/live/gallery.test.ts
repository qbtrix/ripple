// routes/live/gallery.test.ts — Holds the gallery registry to its rules and the
// files it points at: one card per widget type (a run wins over a demo), every
// pruned demo key opens the run that replaced it, the heart and bike gears
// show once as their figures (the weaker same-topic cards open by key only),
// iso drawings are found for the Anatomy credit, every demo has its component
// in ./demos, every grid id a committed thumb and nothing else in static/thumbs, thumbs.json lists the grid in order (run `bun run thumbs`
// after a change), and every old /showcase URL redirects to what it showed.
// Files are listed with Vite globs.
import { expect, test } from 'vitest';
import { demoItems, galleryItems, GROUPS, isoKeys, itemByKey, liveItems, liveRuns, resolveKey } from './gallery.js';
import { businessScenarios, scenarios } from './scenarios.js';
import { appScenarios } from './app-runs.js';
import { playScenarios } from '../pawbar/play-cards.js';
import { BRANDS } from './brands.js';
import { load } from '../showcase/[...path]/+page.js';
import manifest from '../../../static/thumbs/thumbs.json';

const demos = Object.keys(import.meta.glob('/src/routes/live/demos/*.svelte'));
const thumbs = Object.keys(import.meta.glob('/static/thumbs/*.webp', { query: '?url' }));
const redirect = (path: string) => load({ params: { path } }).to;

test('ids and keys are unique, and every grid group is a filter', () => {
	const all = [...liveItems, ...demoItems];
	expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
	expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
	for (const i of galleryItems) expect(GROUPS as readonly string[], i.id).toContain(i.group);
	for (const g of GROUPS) expect(galleryItems.some((i) => i.group === g), g).toBe(true);
});

test('every business run has its own card under For business, in a brand', () => {
	for (const s of businessScenarios) {
		const card = galleryItems.find((i) => i.key === s.id);
		expect(card?.group, s.id).toBe('For business');
		expect(BRANDS[s.id]?.name, s.id).toBeTruthy();
	}
});

test('the grid has one card per widget type, and a run beats a demo', () => {
	const widgets = galleryItems.map((i) => i.widget);
	expect(widgets.filter((w, i) => widgets.indexOf(w) !== i)).toEqual([]);
	const runWidgets = new Set(liveItems.map((i) => i.widget));
	for (const d of galleryItems.filter((i) => i.kind === 'demo')) expect(runWidgets.has(d.widget), d.id).toBe(false);
	// The near-duplicates that prompted the rule.
	expect(liveItems.find((i) => i.key === 'bill-splitter')?.widget).toBe('bill-split');
	expect(liveItems.find((i) => i.key === 'tokyo-trip')?.widget).toBe('itinerary');
	expect(liveItems.find((i) => i.key === 'memory-match')?.widget).toBe('memory-match');
});

test('a pruned demo key opens the run that replaced it', () => {
	expect(resolveKey('demo-bill-split')).toBe('bill-splitter');
	expect(itemByKey('demo-itinerary')?.key).toBe('tokyo-trip');
	expect(itemByKey('demo-booking')?.kind).toBe('demo');
	for (const d of demoItems) expect(itemByKey(d.key), d.id).toBeTruthy();
});

test('every demo has its component and opens in place on /live', () => {
	for (const i of demoItems) {
		expect(demos, i.id).toContain(`/src/routes/live/demos/${i.id}.svelte`);
		expect(i.href).toBe(`/live?s=demo-${i.id}`);
	}
});

test('every live item is one run', () => {
	expect(liveItems.map((i) => i.href)).toEqual(liveRuns.map((s) => `/live?s=${s.id}`));
	for (const i of liveItems) expect(itemByKey(i.key)).toBe(i);
});

test('the drawings that lost their landing chip are app runs that still open', () => {
	for (const key of ['explainer', 'heart']) {
		expect(appScenarios.map((s) => s.id), key).toContain(key);
		expect([...scenarios, ...playScenarios].map((s) => s.id), key).not.toContain(key);
		expect(itemByKey(key)?.kind, key).toBe('run');
	}
});

test('the heart and bike gears show once, as their hand-built figures in Drawings', () => {
	for (const key of ['heart-pump', 'bike-gears']) expect(galleryItems.find((i) => i.key === key)?.group, key).toBe('Drawings');
	// The weaker same-topic cards keep their keys but get no card.
	for (const key of ['iso-heart', 'iso-bike', 'explainer', 'heart', 'demo-illustration']) {
		expect(galleryItems.some((i) => i.key === key), key).toBe(false);
		expect(itemByKey(key)?.key, key).toBe(key);
	}
});

test('every item has a committed thumb, thumbs.json matches the grid, and no thumb is orphaned', () => {
	for (const i of galleryItems) expect(thumbs, i.id).toContain(`/static/thumbs/${i.id}.webp`);
	expect(manifest.map((m) => m.id)).toEqual(galleryItems.map((i) => i.id));
	expect(thumbs.length).toBe(galleryItems.length);
});

test('old /showcase URLs redirect to /live, its items, or /ds', () => {
	expect(redirect('')).toBe('/live');
	for (const i of demoItems) expect(redirect(i.id)).toBe(itemByKey(i.key)?.href);
	expect(redirect('bill-split')).toBe('/live?s=bill-splitter');
	expect(redirect('booking')).toBe('/live?s=demo-booking');
	expect(redirect('motion')).toBe('/ds/motion');
	expect(() => redirect('nope')).toThrow();
});

test('the Anatomy credit finds the figure and iso-scene runs, and only those', () => {
	expect(isoKeys).toContain('heart-pump');
	expect(isoKeys).toContain('bike-gears');
	expect(isoKeys).toContain('iso-bike');
	expect(isoKeys.has('bill-splitter')).toBe(false);
});
