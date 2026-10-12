// site/docs/highlight-code.ts — highlightCode(src, lang), the site's one
// syntax highlighter for code in more than one language: markdown fences in
// the docs and the landing's code sample. Runs at prerender (server loads),
// never in a client component: the Lezer parsers are ~300 KB and none of the
// @lezer packages is side-effect free, so importing this from a .svelte file
// ships all of them. JSON in the browser (JsonLines, SpecExample) stays on
// highlight.ts's small tokenizer, and json/jsonc/ripple here use that same
// tokenizer, so a spec reads the same everywhere.
// - ts/tsx/js/jsx: @lezer/javascript dialects. css: @lezer/css. svelte/html:
//   @lezer/html with every <script> parsed as TS and <style> as CSS; template
//   {expressions} stay plain. bash/sh/shell: a small regex tokenizer.
//   Anything else is escaped plain text.
// - Token classes are the tok-* set styled from the --code-* tokens in
//   routes/site.css. Output is always escaped: safe for {@html}.

import type { Parser } from '@lezer/common';
import { highlightCode as walk, tagHighlighter, tags as t } from '@lezer/highlight';
import { parser as js } from '@lezer/javascript';
import { parser as css } from '@lezer/css';
import { configureNesting, parser as html } from '@lezer/html';
import { escapeHtml, highlightJson } from './highlight.js';

const ts = js.configure({ dialect: 'ts' });
const PARSERS: Record<string, Parser> = {
	js,
	javascript: js,
	jsx: js.configure({ dialect: 'jsx' }),
	ts,
	typescript: ts,
	tsx: js.configure({ dialect: 'ts jsx' }),
	css,
	html: html.configure({
		wrap: configureNesting([
			{ tag: 'script', parser: ts },
			{ tag: 'style', parser: css }
		])
	})
};
PARSERS.svelte = PARSERS.html;

// More specific tags win, so null/atom/unit/self (keyword subtags) and
// function(...) (over the bare name) are listed explicitly.
const classes = tagHighlighter([
	{ tag: t.keyword, class: 'tok-kw' },
	{ tag: [t.string, t.regexp, t.attributeValue], class: 'tok-str' },
	{ tag: [t.number, t.unit], class: 'tok-num' },
	{ tag: [t.bool, t.null, t.atom, t.self], class: 'tok-lit' },
	{ tag: t.comment, class: 'tok-comment' },
	{ tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: 'tok-fn' },
	{ tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
	{ tag: t.propertyName, class: 'tok-key' },
	{ tag: t.tagName, class: 'tok-tag' },
	{ tag: t.attributeName, class: 'tok-attr' },
	{ tag: [t.punctuation, t.operator], class: 'tok-punct' }
]);

const span = (cls: string, text: string) => `<span class="${cls}">${escapeHtml(text)}</span>`;

/** Highlight `src` as `lang` (a fence's info word). Unknown languages come back escaped, untouched. */
export function highlightCode(src: string, lang: string): string {
	const l = lang.toLowerCase();
	if (l === 'json' || l === 'jsonc' || l === 'ripple') return highlightJsonc(src);
	if (l === 'bash' || l === 'sh' || l === 'shell') return highlightShell(src);
	const parser = PARSERS[l];
	if (!parser) return escapeHtml(src);
	let out = '';
	walk(
		src,
		parser.parse(src),
		classes,
		(text, cls) => (out += cls ? span(cls, text) : escapeHtml(text)),
		() => (out += '\n')
	);
	return out;
}

/** highlightJson plus // and /* *\/ comments (found outside strings). Plain JSON comes out identical. */
function highlightJsonc(src: string): string {
	let out = '';
	let last = 0;
	for (const m of src.matchAll(/"(?:\\.|[^"\\\n])*"|(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/g)) {
		if (m[1] === undefined) continue;
		out += highlightJson(src.slice(last, m.index)) + span('tok-comment', m[1]);
		last = m.index + m[0].length;
	}
	return out + highlightJson(src.slice(last));
}

// Whitespace, a comment (only where a word starts), a quoted string, a control
// operator, or a word. Words run up to whitespace, quotes or an operator.
const SHELL = /(\s+)|(#[^\n]*)|('[^']*'?|"(?:\\.|[^"\\])*"?)|(\|\||&&|[|;&])|([^\s|;&'"]+)/g;

/** Shell: the command word (first on a line or after | && || ; &), --flags, strings, # comments. */
function highlightShell(src: string): string {
	let out = '';
	let command = true;
	for (const [, space, comment, str, op, word] of src.matchAll(SHELL)) {
		if (space !== undefined) {
			out += space;
			if (space.includes('\n')) command = true;
		} else if (comment !== undefined) out += span('tok-comment', comment);
		else if (str !== undefined) out += span('tok-str', str);
		else if (op !== undefined) {
			out += span('tok-punct', op);
			command = true;
		} else if (word.startsWith('-')) out += span('tok-attr', word);
		else if (command && /^[A-Za-z_]\w*=/.test(word)) {
			// NAME=value before a command (or on its own line): the command is still to come.
			const eq = word.indexOf('=');
			out += span('tok-key', word.slice(0, eq)) + span('tok-punct', '=') + escapeHtml(word.slice(eq + 1));
		} else if (command) {
			out += span('tok-fn', word);
			command = false;
		} else out += escapeHtml(word);
	}
	return out;
}
