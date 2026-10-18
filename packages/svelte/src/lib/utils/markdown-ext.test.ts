// utils/markdown-ext.test.ts — What the markdown widget's marked extensions
// treat as math (and what they leave as text), and the mermaid fence wrapper.
import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { markedMath, markedMermaid } from './markdown-ext.js';

const md = new Marked(markedMath(), markedMermaid());
const html = (src: string) => md.parse(src, { gfm: true, async: false }) as string;
const texes = (src: string) => [...html(src).matchAll(/data-tex="([^"]*)"/g)].map((m) => m[1]);

describe('markdown math', () => {
	it('finds inline $...$ and \\(...\\)', () => {
		expect(texes('Energy $E=mc^2$ and \\(a+b\\) here')).toEqual(['E=mc^2', 'a+b']);
	});

	it('renders display $$...$$ and \\[...\\] as blocks, not paragraphs', () => {
		const out = html('Amdahl:\n\n$$\nS = \\frac{1}{(1-p) + p/s}\n$$\n\nand\n\n\\[x^2\\]\n');
		expect(out).toMatch(/<div class="ripple-math ripple-math-display" data-tex="S = \\frac\{1\}\{\(1-p\) \+ p\/s\}" data-display="">/);
		expect(out).toContain('data-tex="x^2"');
		expect(out).not.toMatch(/<p><div/);
	});

	it('treats inline $$...$$ inside a line as display math', () => {
		expect(html('so $$x$$ ok')).toContain('data-display=""');
	});

	it.each([
		['$5 and $10', 'currency pair'],
		['costs $5$ today', 'digits only'],
		['between $ 1 and 2 $', 'space after opening'],
		['from $3.50 to $4.25', 'decimals'],
		['a $x $ b', 'space before closing'],
		['price $x$5', 'digit after closing']
	])('%s stays text (%s)', (src) => {
		expect(texes(src)).toEqual([]);
	});

	it('leaves an escaped \\$ and code spans alone', () => {
		expect(texes('a \\$x$ b')).toEqual([]);
		expect(texes('run `$x$` now')).toEqual([]);
		expect(texes('```\n$$x$$\n```')).toEqual([]);
	});

	it('escapes TeX and the visible source', () => {
		const out = html('$<img src=x onerror=alert(1)>"$');
		expect(out).not.toContain('<img');
		expect(out).toContain('&lt;img');
		expect(out).toContain('&quot;');
	});

	it('keeps the source as written as the placeholder text', () => {
		expect(html('see $a^2$')).toContain('>$a^2$</span>');
	});
});

describe('mermaid fences', () => {
	it('wraps a mermaid fence, escaped, and leaves other fences alone', () => {
		const out = html('```mermaid\ngraph TD\n  A["<b>x</b>"] --> B\n```\n\n```sql\nselect 1;\n```');
		expect(out).toContain('<div class="ripple-diagram"><pre><code class="language-mermaid">graph TD\n  A[&quot;&lt;b&gt;x&lt;/b&gt;&quot;] --&gt; B</code></pre></div>');
		expect(out).toContain('<code class="language-sql">select 1;');
	});
});
