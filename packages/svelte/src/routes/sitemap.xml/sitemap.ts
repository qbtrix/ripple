// routes/sitemap.xml/sitemap.ts — The public, indexable pages, as absolute URLs, for
// /sitemap.xml. Docs and widget pages come from the same lists their routes
// prerender from (docs content, the widget manifest, DS_PAGES), so a new page
// lands here on its own. Left out on purpose: /docs (redirects to its first
// page), /showcase/* (redirects), the noindex labs and /pay.
import { pages } from '$lib/site/docs/content.js';
import { SITE_URL } from '$lib/site/docs/model.js';
import { manifestEntries } from '$lib/manifest/index.js';
import { DS_PAGES } from '../ds/pages.js';

export function sitemapUrls(): string[] {
	const paths = [
		'/',
		'/live',
		'/playground',
		'/ds',
		...DS_PAGES.map((p) => `/ds/${p.slug}`),
		...pages.map((p) => `/docs/${p.slug}`),
		'/docs/widgets',
		...manifestEntries.map((e) => `/docs/widgets/${e.type}`)
	];
	return paths.map((p) => (p === '/' ? `${SITE_URL}/` : SITE_URL + p));
}

export function sitemapXml(urls: string[] = sitemapUrls()): string {
	const body = urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
