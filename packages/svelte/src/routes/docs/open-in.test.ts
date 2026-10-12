// open-in.test.ts — The "Open in" links: each opens a new chat that already
// asks the assistant to read the page's markdown.

import { describe, expect, test } from 'vitest';
import { openInLinks, pagePrompt } from './open-in.js';

const md = 'https://ripple.pocketpaw.xyz/docs/concepts/streaming.md';
const prompt = pagePrompt(md, 'Streaming');
const byName = (base?: string) => Object.fromEntries(openInLinks(prompt, base).map((l) => [l.name, l.href]));

describe('openInLinks', () => {
	test('the prompt names the page and its markdown url', () => {
		expect(prompt).toContain(md);
		expect(prompt).toContain('Streaming');
	});

	test('Claude and ChatGPT open a new chat with the prompt in q', () => {
		const links = byName();
		const claude = new URL(links.Claude);
		expect(claude.origin + claude.pathname).toBe('https://claude.ai/new');
		expect(claude.searchParams.get('q')).toBe(prompt);
		const gpt = new URL(links.ChatGPT);
		expect(gpt.origin).toBe('https://chatgpt.com');
		expect(gpt.searchParams.get('q')).toBe(prompt);
	});

	test('PocketPaw opens Paw OS with the prompt in the fragment, never the query', () => {
		const pp = new URL(byName().PocketPaw);
		expect(pp.origin).toBe('https://os.pocketpaw.xyz');
		expect(pp.search).toBe('?ref=ripple');
		expect(decodeURIComponent(pp.hash)).toBe(`#prompt=${prompt}`);
	});

	test('a configured Paw OS base is used, and an unsafe one is ignored', () => {
		expect(byName('https://pawos.example.dev').PocketPaw.startsWith('https://pawos.example.dev/?ref=ripple#prompt=')).toBe(true);
		expect(byName('javascript:alert(1)').PocketPaw.startsWith('https://os.pocketpaw.xyz/')).toBe(true);
	});
});
