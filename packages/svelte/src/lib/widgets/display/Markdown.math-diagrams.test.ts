// Markdown.math-diagrams.test.ts — the markdown widget's browser upgrades:
// math becomes sanitized MathML (real temml), ```mermaid fences become
// sanitized SVG through a mocked mermaid (its renderer needs a real browser),
// mermaid is imported only when a fence exists, a failed render keeps the
// source, a streaming spec defers diagrams, and a theme flip redraws them,
// whether it lands on <html> or on an embed's shadow host and wrapper.
import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Markdown from './Markdown.svelte';
import Ripple from '$lib/Ripple.svelte';

const m = vi.hoisted(() => ({
	loaded: 0,
	render: vi.fn(async (_id: string, _src: string) => ({ svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' })),
	initialize: vi.fn()
}));
vi.mock('mermaid', () => {
	m.loaded++;
	return { default: { render: m.render, initialize: m.initialize } };
});

/** What the mocked canvas reads back: every resolved palette colour. A test flips it to fake a theme change. */
let pixel = [255, 255, 255, 255];

beforeAll(() => {
	// jsdom has no 2D canvas; the palette resolver only needs these three calls.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() => ({ fillRect() {}, getImageData: () => ({ data: pixel }), fillStyle: '' }) as never
	);
});
afterEach(() => {
	m.render.mockClear();
	m.initialize.mockClear();
});

const FENCE = '```mermaid\ngraph TD\n  A --> B\n```';

describe('markdown widget, math', () => {
	it('upgrades inline and display math to MathML', async () => {
		const { container } = render(Markdown, { props: { content: 'So $x^2$ and\n\n$$\\frac{1}{2}$$' } });
		await vi.waitFor(() => expect(container.querySelectorAll('math').length).toBe(2));
		expect(container.querySelector('.ripple-math-display math')).not.toBeNull();
		expect(container.querySelector('mfrac')).not.toBeNull();
	});

	it('leaves currency as text', async () => {
		const { container } = render(Markdown, { props: { content: 'Plans cost $5 and $10 a month.' } });
		await new Promise((r) => setTimeout(r, 50));
		expect(container.querySelector('.ripple-math, math')).toBeNull();
		expect(container.textContent).toContain('$5 and $10');
	});

	it('keeps hostile TeX inert', async () => {
		const { container } = render(Markdown, {
			props: { content: '$\\href{javascript:alert(1)}{x}$ and $\\htmlClass{x}{y}$ and $\\color{red}{z}$' }
		});
		await vi.waitFor(() => expect(container.querySelector('math')).not.toBeNull());
		expect(container.querySelector('[href]')).toBeNull();
		expect(container.innerHTML).not.toMatch(/onclick|style=/);
	});

	it('shows the source when TeX does not parse', async () => {
		const { container } = render(Markdown, { props: { content: 'bad $\\frac{1$ here' } });
		await new Promise((r) => setTimeout(r, 100));
		expect(container.querySelector('math')).toBeNull();
		expect(container.textContent).toContain('$\\frac{1$');
	});
});

describe('markdown widget, TeX written straight into a spec prop', () => {
	it('survives expression resolution while a real expression beside it resolves', async () => {
		const spec = {
			state: { name: 'Ada' },
			ui: { type: 'markdown', props: { content: 'For {state.name}: $x^{2} + \\frac{1}{(1-p) + \\frac{p}{s}}$' } }
		};
		const { container } = render(Ripple, { props: { spec } });
		await vi.waitFor(() => expect(container.querySelector('math mfrac mfrac')).not.toBeNull());
		expect(container.textContent).toContain('For Ada:');
		expect(container.querySelector('math msup')).not.toBeNull();
	});
});

describe('markdown widget, mermaid', () => {
	it('does not import mermaid without a fence', async () => {
		render(Markdown, { props: { content: '# Title\n\n```sql\nselect 1;\n```' } });
		await new Promise((r) => setTimeout(r, 50));
		expect(m.loaded).toBe(0);
		expect(m.render).not.toHaveBeenCalled();
	});

	it('draws a fence as SVG in strict mode with SVG labels, hiding the source', async () => {
		const { container } = render(Markdown, { props: { content: FENCE } });
		await vi.waitFor(() => expect(container.querySelector('.ripple-diagram-canvas svg')).not.toBeNull());
		expect(m.loaded).toBe(1);
		expect(m.render.mock.calls[0][1]).toContain('A --> B');
		const config = m.initialize.mock.calls[0][0];
		expect(config.securityLevel).toBe('strict');
		expect(config.htmlLabels).toBe(false);
		expect(config).toMatchObject({ look: 'neo', layout: 'dagre', flowchart: { curve: 'basis' } });
		expect(container.querySelector('pre')?.hidden).toBe(true);
	});

	it('sanitizes what mermaid returns', async () => {
		m.render.mockResolvedValueOnce({
			svg: `<svg viewBox="0 0 9 9" onload="alert(1)"><style>@import url(http://x/a.css);.n{fill:url(http://x/b)}</style><script>alert(2)</script><a href="javascript:alert(3)"><rect onclick="alert(4)"/></a><foreignObject><iframe src="http://x"></iframe></foreignObject></svg>`
		});
		const { container } = render(Markdown, { props: { content: FENCE } });
		await vi.waitFor(() => expect(container.querySelector('.ripple-diagram-canvas svg')).not.toBeNull());
		const out = container.querySelector('.ripple-diagram-canvas')!.innerHTML;
		expect(out).not.toMatch(/onload|onclick|<script|javascript:|<iframe|@import|url\(http/i);
	});

	it('keeps the source on screen when mermaid cannot parse it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		m.render.mockRejectedValueOnce(new Error('Parse error'));
		const { container } = render(Markdown, { props: { content: '```mermaid\ngraph TD\n  A -->\n```' } });
		await vi.waitFor(() => expect(m.render).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 20));
		const pre = container.querySelector('pre')!;
		expect(pre.hidden).toBe(false);
		expect(pre.textContent).toContain('A -->');
		expect(container.querySelector('.ripple-diagram-canvas')).toBeNull();
	});

	it('redraws when the html theme changes', async () => {
		const { container } = render(Markdown, { props: { content: FENCE } });
		await vi.waitFor(() => expect(container.querySelector('.ripple-diagram-canvas svg')).not.toBeNull());
		pixel = [10, 10, 10, 255];
		try {
			document.documentElement.classList.add('dark');
			await vi.waitFor(() => expect(m.render).toHaveBeenCalledTimes(2));
		} finally {
			document.documentElement.classList.remove('dark');
			pixel = [255, 255, 255, 255];
		}
	});

	it('redraws when an embed flips its theme inside a shadow root', async () => {
		// @ripple-ui/embed: data-theme on the shadow host, .dark on .ripple-embed-root; <html> never changes.
		const host = document.createElement('div');
		document.body.append(host);
		const wrap = document.createElement('div');
		wrap.className = 'ripple-embed-root';
		host.attachShadow({ mode: 'open' }).append(wrap);
		try {
			render(Markdown, { props: { content: FENCE }, target: wrap });
			await vi.waitFor(() => expect(wrap.querySelector('.ripple-diagram-canvas svg')).not.toBeNull());
			pixel = [10, 10, 10, 255];
			host.dataset.theme = 'dark';
			wrap.classList.add('dark');
			await vi.waitFor(() => expect(m.render).toHaveBeenCalledTimes(2));
			expect(m.initialize.mock.lastCall![0].themeVariables.darkMode).toBe(true);
		} finally {
			pixel = [255, 255, 255, 255];
			host.remove();
		}
	});

	it('waits for a streamed spec to finish before drawing', async () => {
		const { container } = render(Markdown, {
			props: { content: FENCE },
			context: new Map([['ui-streaming', () => 'active']])
		});
		await new Promise((r) => setTimeout(r, 50));
		expect(m.render).not.toHaveBeenCalled();
		expect(container.querySelector('pre')?.textContent).toContain('A --> B');
	});
});

