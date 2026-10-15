// routes/ds/pages.test.ts: the /ds subpages and the hub list stay in step.
// Every DS_PAGES entry has a route that renders through Showcase.svelte with its
// own slug (so the h1, <title> and meta description come from the entry the hub
// card shows), and every /ds/<slug> route is listed, except premium, which only
// redirects to effects. Public copy on these pages carries no em dashes.
import { describe, expect, it } from 'vitest';
import { DS_PAGES, dsPage } from './pages.js';

const sources = import.meta.glob<string>('./*/+page.svelte', { query: '?raw', import: 'default', eager: true });
const slugOf = (path: string) => path.split('/')[1];
const routes = Object.keys(sources).map(slugOf);

describe('/ds pages', () => {
	it('lists every subpage route once, and nothing else', () => {
		expect(DS_PAGES.map((p) => p.slug).toSorted()).toEqual(routes.filter((r) => r !== 'premium').toSorted());
		expect(new Set(DS_PAGES.map((p) => p.title)).size).toBe(DS_PAGES.length);
	});

	it.each(DS_PAGES)('$slug renders through Showcase with its own slug', ({ slug }) => {
		expect(sources[`./${slug}/+page.svelte`]).toContain(`<Showcase slug="${slug}"`);
	});

	it.each(DS_PAGES)('$slug has page copy without em dashes', ({ slug, title, caption, description }) => {
		// Markup only: comments in the script block are not page copy.
		const markup = sources[`./${slug}/+page.svelte`].replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
		expect(markup).not.toContain('—');
		expect(`${title} ${caption} ${description}`).not.toContain('—');
	});

	it('has no page named premium', () => {
		expect(DS_PAGES.some((p) => /premium/i.test(`${p.slug} ${p.title} ${p.caption} ${p.description}`))).toBe(false);
	});

	it('throws on an unknown slug', () => {
		expect(() => dsPage('nope')).toThrow(/nope/);
	});
});
