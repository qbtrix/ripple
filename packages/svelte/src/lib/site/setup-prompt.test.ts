// setup-prompt.test.ts — The coding-agent setup prompt stays one text and
// stays pointed at real pages: the Install docs page shows it verbatim, every
// docs URL in it is a page the site builds, and the names it tells an agent
// to use (headings, exports) exist.

import { expect, test } from 'vitest';
import { SETUP_PROMPT } from './setup-prompt.js';
import { SITE_URL } from './docs/model.js';
import { pages } from './docs/content.js';
import * as svelte from '../index.js';

const install = () => pages.find((p) => p.slug === 'getting-started/install')!;

test('the Install page shows the prompt verbatim', () => {
	const md = install().raw.replaceAll('\r\n', '\n');
	expect(md).toContain('```text\n' + SETUP_PROMPT + '\n```');
});

test('every docs link in the prompt is a page the site builds', () => {
	const links = [...SETUP_PROMPT.matchAll(new RegExp(`${SITE_URL}/docs/([a-z0-9/-]+)\\.md`, 'g'))].map((m) => m[1]);
	expect(links.length).toBeGreaterThanOrEqual(4);
	const slugs = new Set(pages.map((p) => p.slug));
	for (const slug of links) expect(slugs.has(slug), slug).toBe(true);
});

test('the headings and exports it names exist', () => {
	expect(install().raw).toContain('## Set up Tailwind');
	expect(typeof svelte.specIssues).toBe('function');
	expect(typeof svelte.formatSpecIssues).toBe('function');
});
