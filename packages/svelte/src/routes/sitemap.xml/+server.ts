// /sitemap.xml: every public, indexable page (see ./sitemap.ts), written
// at prerender. robots.txt points crawlers here.
import { sitemapXml } from './sitemap.js';

export const prerender = true;
export const GET = () => new Response(sitemapXml(), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
