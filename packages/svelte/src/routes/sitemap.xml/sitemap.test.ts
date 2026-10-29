// routes/sitemap.xml/sitemap.test.ts: the sitemap lists docs and widget pages from their
// sources, keeps labs and /pay out, and has no duplicates.
import { describe, expect, it } from 'vitest';
import { sitemapUrls, sitemapXml } from './sitemap.js';
import { SITE_URL } from '$lib/site/docs/model.js';

describe('sitemap', () => {
	const urls = sitemapUrls();
	it('covers the landing, a docs page and a widget page', () => {
		expect(urls).toContain(`${SITE_URL}/`);
		expect(urls).toContain(`${SITE_URL}/docs/widgets/heatmap`);
		expect(urls.some((u) => u.startsWith(`${SITE_URL}/docs/`) && !u.includes('/widgets'))).toBe(true);
	});
	it('leaves out labs, pay and the /docs redirect', () => {
		expect(urls.filter((u) => /\/(labs|[a-z-]+-lab|pay)(\/|$)/.test(u))).toEqual([]);
		expect(urls).not.toContain(`${SITE_URL}/docs`);
	});
	it('has each URL once and well-formed XML around it', () => {
		expect(new Set(urls).size).toBe(urls.length);
		expect(sitemapXml(['https://x/a'])).toContain('<url><loc>https://x/a</loc></url>');
	});
});
