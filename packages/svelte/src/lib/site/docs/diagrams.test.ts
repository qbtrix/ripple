// diagrams.test.ts — Every ```mermaid fence in src/docs parses, so a broken
// diagram fails the test run instead of shipping as raw source. mermaid.parse
// runs under jsdom (the render half needs a real browser; the docs pages are
// browser-checked for that).
import { Marked, type Tokens } from 'marked';
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';
import { pages } from './content.js';
import { parseFrontmatter, splitDiagramCaption } from './markdown.js';

const fences = pages.flatMap((page) =>
	new Marked()
		.lexer(parseFrontmatter(page.raw, page.file).body)
		.filter((t): t is Tokens.Code => t.type === 'code' && t.lang?.trim() === 'mermaid')
		.map((t, i) => ({ name: `${page.slug} #${i + 1}`, ...splitDiagramCaption(t.text) }))
);

describe('docs diagrams', () => {
	it('exist', () => {
		expect(fences.length).toBeGreaterThan(0);
	});
	it.each(fences)('$name parses', async ({ source }) => {
		await expect(mermaid.parse(source)).resolves.toBeTruthy();
	});
	it.each(fences)('$name has a caption', ({ caption }) => {
		expect(caption).not.toBe('');
	});
});
