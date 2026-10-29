// utils/markdown-ext.ts — marked extensions for the markdown widget: LaTeX math
// and ```mermaid fences. Both emit a placeholder the widget upgrades in the
// browser (math to MathML via temml, fences to SVG via utils/mermaid.ts), both
// lazy-loaded, so this file stays plain string work and runs under SSR.
// - Inline: $x$, \(x\) and $$x$$ inside a line. Block: a paragraph that is
//   $$...$$ or \[...\] on its own lines, so display math is not wrapped in <p>.
// - `$` is math only when no space follows the opening one or precedes the
//   closing one, the closing one is not followed by a digit, and the content
//   is not a plain number. So "$5 and $10" and "costs $5$" stay text. `\$` is
//   marked's escape and stays a literal dollar.
// - A ```mermaid fence becomes <div class="ripple-diagram"> around the usual
//   <pre><code class="language-mermaid">; the wrapper gives the widget a node
//   it owns to draw into, and the <pre> is the fallback when drawing fails.
// - The math placeholder's text is the source as written (delimiters included): it
//   is what SSR, a failed render and a reader without JS see. The TeX itself
//   rides in data-tex. Everything is escaped here, and the widget's sanitizer
//   still runs over the result.
import type { MarkedExtension, Tokens } from 'marked';

export const MATH_CLASS = 'ripple-math';

export const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INLINE: Array<[RegExp, boolean]> = [
	[/^\$\$((?:\\[\s\S]|[^\\$])+?)\$\$/, true],
	[/^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/, false],
	[/^\\\(([\s\S]+?)\\\)/, false]
];
const BLOCK = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/;
const PLAIN_NUMBER = /^[\d\s.,]+$/;

function placeholder(token: Tokens.Generic, tag: 'span' | 'div'): string {
	const { tex, display, raw } = token;
	const cls = display ? `${MATH_CLASS} ${MATH_CLASS}-display` : MATH_CLASS;
	return `<${tag} class="${cls}" data-tex="${escapeHtml(tex)}"${display ? ' data-display=""' : ''}>${escapeHtml(raw.trim())}</${tag}>${tag === 'div' ? '\n' : ''}`;
}

export function markedMath(): MarkedExtension {
	return {
		extensions: [
			{
				name: 'mathBlock',
				level: 'block',
				start: (src) => src.match(/^ {0,3}(?:\$\$|\\\[)/m)?.index,
				tokenizer(src) {
					const m = BLOCK.exec(src);
					if (!m) return undefined;
					const tex = (m[1] ?? m[2]).trim();
					if (!tex) return undefined;
					return { type: 'mathBlock', raw: m[0], tex, display: true };
				},
				renderer: (token) => placeholder(token, 'div')
			},
			{
				name: 'mathInline',
				level: 'inline',
				start(src) {
					const m = /(?<!\\)(?:\$|\\\()/.exec(src);
					return m?.index;
				},
				tokenizer(src) {
					for (const [re, display] of INLINE) {
						const m = re.exec(src);
						if (!m) continue;
						const tex = m[1].trim();
						if (!tex || PLAIN_NUMBER.test(tex)) return undefined;
						return { type: 'mathInline', raw: m[0], tex, display };
					}
					return undefined;
				},
				renderer: (token) => placeholder(token, 'span')
			}
		]
	};
}


/** Wrap ```mermaid fences for the widget to draw; every other fence renders as usual. */
export function markedMermaid(): MarkedExtension {
	return {
		renderer: {
			code({ text, lang }: Tokens.Code) {
				if ((lang ?? '').split(/\s/)[0] !== 'mermaid') return false;
				return `<div class="ripple-diagram"><pre><code class="language-mermaid">${escapeHtml(text)}</code></pre></div>\n`;
			}
		}
	};
}
