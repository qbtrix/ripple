// Which braces in a prop string are expressions: TeX and mermaid written
// straight into a markdown prop must survive, every existing form must resolve.
import { describe, expect, it } from 'vitest';
import { hasExpressions, resolveString, type ResolverContext } from './expression-resolver.js';
import { specAudit } from './spec-audit.js';

const ctx = (state: Record<string, unknown> = {}, extra: Partial<ResolverContext> = {}): ResolverContext => ({
	state,
	...extra
});

describe('resolveString: TeX survives', () => {
	it.each([
		'$\\frac{1}{2}$',
		'$x^{2} + y^{2}$',
		'$\\sqrt{a+b}$',
		'$\\sqrt[3]{x}$',
		'$a_{n+1} = a_{n} + d$',
		'$e^{i\\pi} + 1 = 0$',
		'$\\sum_{i=1}^{n} i$',
		'$\\frac{a^{2}}{b_{1}}$',
		'$\\{a, b\\}$',
		'$\\binom{n}{k}$',
		'$$\n\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}\n$$',
		'$\\mathbb{R}^{n}$',
		'$\\text{rate} = \\frac{\\Delta y}{\\Delta x}$',
		'$$\nS = \\frac{1}{(1-p) + \\frac{p}{s}} = \\frac{1}{0.2 + 0.08} \\approx 3.6\n$$'
	])('%s', (tex) => {
		expect(resolveString(tex, ctx({ a: 5, b: 7 }))).toBe(tex);
	});

	it('leaves the demo answer byte for byte', () => {
		const answer =
			'The query is a fraction $p = 0.8$ of the time.\n\n$$\nS = \\frac{1}{(1-p) + \\frac{p}{s}} = \\frac{1}{0.2 + 0.08} \\approx 3.6\n$$\n\nSo p95 drops to $1250 \\times 0.28 = 350$ ms. Plans cost $5 and $10.\n\n```mermaid\nflowchart TD\n  C[Client] --> G[Gateway]\n  G --> Q[(Orders query)]\n```';
		expect(resolveString(answer, ctx())).toBe(answer);
	});
});

describe('resolveString: mermaid and code survive', () => {
	it('keeps decision and hexagon nodes', () => {
		const src = '```mermaid\nflowchart TD\n  A[Start] --> B{Is it ok?}\n  B --> C{Valid}\n  C --> D{{Retry}}\n```';
		expect(resolveString(src, ctx())).toBe(src);
	});

	it('keeps a multi-line brace block (class diagram, JSON sample)', () => {
		const src = 'classDiagram\n  class Order {\n    +int id\n  }\n\n```json\n{\n  "a": 1\n}\n```';
		expect(resolveString(src, ctx())).toBe(src);
	});
});

describe('resolveString: every expression form still resolves', () => {
	const state = { name: 'Ada', a: 2, b: 3, ok: true, c: ':alert(1)', list: [1, 2], id: 'x' };

	it.each([
		['Hello {state.name}!', 'Hello Ada!'],
		['{state.a}{state.b}', '23'],
		['{state.a} + {state.b} = {state.a + state.b}', '2 + 3 = 5'],
		['{state.ok ? \'yes\' : \'no\'}!', 'yes!'],
		["{state.ok ? 'it\\'s' : 'no'} here", "it\\'s here"], // evaluated, not literal: the backslash sits in a string
		['n={(state.a + state.b) * 2}', 'n=10'],
		['{state.list.count()} items', '2 items'],
		['{name} and {missing}.', 'Ada and .'],
		['stops.{state.a}.done', 'stops.2.done'],
		['modal_{id}', 'modal_x'],
		['javascript{state.c}', 'javascript:alert(1)'],
		['Price ${state.a}.00', 'Price $2.00'],
		['row{index}', 'row4']
	])('%s', (src, out) => {
		expect(resolveString(src, ctx(state, { index: 4 }))).toBe(out);
	});

	it('a loop alias glued to text resolves', () => {
		expect(resolveString('lists_{i}', ctx({}, { i: 1 }))).toBe('lists_1');
	});

	it('a whole-string expression keeps its type', () => {
		expect(resolveString('{state.list}', ctx({ list: [1, 2] }))).toEqual([1, 2]);
	});

	it('TeX and an expression in one string: TeX kept, expression resolved', () => {
		expect(resolveString('$\\frac{1}{2}$ for {state.name}', ctx({ name: 'Ada' }))).toBe('$\\frac{1}{2}$ for Ada');
	});

	it('a glued brace that reads existing state is live math', () => {
		expect(resolveString('$x^{n}$', ctx({ n: 3 }))).toBe('$x^3$');
	});

	it('\\{ escapes a brace and keeps the backslash for markdown', () => {
		expect(resolveString('use \\{state.name} literally, not {state.name}', ctx({ name: 'Ada' }))).toBe(
			'use \\{state.name} literally, not Ada'
		);
	});
});

describe('hasExpressions', () => {
	it('is false for pure TeX command arguments', () => {
		expect(hasExpressions('$\\frac{1}{2}$')).toBe(false);
	});
	it('stays true for any possible expression (no context to rule a glued one out)', () => {
		expect(hasExpressions('modal_{id}')).toBe(true);
		expect(hasExpressions('Hi {state.name}')).toBe(true);
	});
	it('is stable across calls (no lastIndex state)', () => {
		expect([hasExpressions('{a}'), hasExpressions('{a}')]).toEqual([true, true]);
	});
});

describe('spec audit on TeX content', () => {
	it('reports nothing for TeX and mermaid in a markdown prop', () => {
		const reports = specAudit({
			version: '1.0',
			state: { name: 'Ada' },
			ui: {
				type: 'markdown',
				props: {
					content: 'Hi {state.name}. $S = \\frac{1}{(1-p) + \\frac{p}{s}}$ and $x^{2}$\n\n```mermaid\nflowchart TD\n  A --> B{Ok?}\n```'
				}
			}
		}, { widgetTypes: ['markdown'] });
		const items = reports.flatMap((r) => [...r.items, ...(r.warnings ?? [])]);
		expect(items).toEqual([]);
		const codes = items.map((i) => i.code);
		expect(codes).not.toContain('leftover');
		expect(codes).not.toContain('exprThrows');
	});
});
