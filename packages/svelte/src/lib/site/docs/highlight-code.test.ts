// site/docs/highlight-code.test.ts — highlightCode per language: tokens land in
// the right tok-* class, markup in the source always comes out escaped, an
// unknown language passes through as plain escaped text, and svelte nests TS
// and CSS inside its <script> and <style>.
import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight-code.js';
import { escapeHtml, highlightJson } from './highlight.js';

const tok = (cls: string, text: string) => `<span class="${cls}">${escapeHtml(text)}</span>`;
const strip = (html: string) => html.replace(/<[^>]+>/g, '');
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('highlightCode', () => {
	it('ts: keywords, strings, comments, types and calls', () => {
		const out = highlightCode("const a: Foo = go('x<y'); // done & dusted", 'ts');
		expect(out).toContain(tok('tok-kw', 'const'));
		expect(out).toContain(tok('tok-type', 'Foo'));
		expect(out).toContain(tok('tok-fn', 'go'));
		expect(out).toContain(tok('tok-str', "'x<y'"));
		expect(out).toContain(tok('tok-comment', '// done & dusted'));
	});

	it('tsx and js parse their dialects', () => {
		expect(highlightCode('const el = <Widget a={1} />;', 'tsx')).toContain(tok('tok-tag', 'Widget'));
		expect(highlightCode('let x = /* c */ 2;', 'js')).toContain(tok('tok-num', '2'));
	});

	it('css: properties, at-rules, strings and comments', () => {
		const out = highlightCode('/* a<b */\n@import "x.css";\n.root { color: red; }', 'css');
		expect(out).toContain(tok('tok-comment', '/* a<b */'));
		expect(out).toContain(tok('tok-kw', '@import'));
		expect(out).toContain(tok('tok-str', '"x.css"'));
		expect(out).toContain(tok('tok-key', 'color'));
		expect(out).toContain(tok('tok-type', 'root'));
	});

	it('svelte: TS in <script>, CSS in <style>, markup tags and attributes, {expressions} plain', () => {
		const src = '<script lang="ts">\n  let n: number = $state(0);\n</script>\n\n{#if n}<Ripple spec={n} />{/if}\n<style>\n  .a { margin: 0; }\n</style>';
		const out = highlightCode(src, 'svelte');
		expect(out).toContain(tok('tok-kw', 'let'));
		expect(out).toContain(tok('tok-type', 'number'));
		expect(out).toContain(tok('tok-key', 'margin'));
		expect(out).toContain(tok('tok-tag', 'Ripple'));
		expect(out).toContain(tok('tok-attr', 'spec'));
		expect(out).toContain('{#if n}');
		expect(unescape(strip(out))).toBe(src);
	});

	it('bash: command word, flags, strings, comments and NAME=value', () => {
		const out = highlightCode('API_KEY=abc\nbun add -D "@x/y" # dev only\nls | grep -v x', 'bash');
		expect(out).toContain(tok('tok-key', 'API_KEY'));
		expect(out).toContain(tok('tok-fn', 'bun'));
		expect(out).toContain('add');
		expect(out).not.toContain(tok('tok-fn', 'add'));
		expect(out).toContain(tok('tok-attr', '-D'));
		expect(out).toContain(tok('tok-str', '"@x/y"'));
		expect(out).toContain(tok('tok-comment', '# dev only'));
		expect(out).toContain(tok('tok-fn', 'grep'));
		expect(highlightCode('echo a#b', 'sh')).not.toContain('tok-comment');
	});

	it('json and ripple match highlightJson; jsonc adds comments outside strings', () => {
		const json = '{"a": [1, true, null], "u": "http://x"}';
		expect(highlightCode(json, 'json')).toBe(highlightJson(json));
		expect(highlightCode(json, 'ripple')).toBe(highlightJson(json));
		const out = highlightCode('{"u": "a//b", "c": [ /* list */ ] // end\n}', 'jsonc');
		expect(out).toContain(tok('tok-str', '"a//b"'));
		expect(out).toContain(tok('tok-comment', '/* list */'));
		expect(out).toContain(tok('tok-comment', '// end'));
	});

	it('unknown languages pass through escaped and untouched', () => {
		const src = '<img src=x onerror=alert(1)> & "q"';
		expect(highlightCode(src, 'text')).toBe(escapeHtml(src));
		expect(highlightCode(src, '')).toBe(escapeHtml(src));
	});

	it('every language escapes markup in the source and keeps the text intact', () => {
		const src = '<b onclick="x">a & b</b> // </code><script>';
		for (const lang of ['ts', 'tsx', 'js', 'css', 'svelte', 'html', 'json', 'jsonc', 'bash', 'text']) {
			const out = highlightCode(src, lang);
			expect(out, lang).not.toMatch(/<(?!\/?span[ >])/);
			expect(unescape(strip(out)), lang).toBe(src);
		}
	});
});
