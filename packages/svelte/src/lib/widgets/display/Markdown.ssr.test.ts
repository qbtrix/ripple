// widgets/display/Markdown.ssr.test.ts — the markdown widget renders through
// svelte/server: math and mermaid fences arrive as their source (the browser
// upgrades them), and nothing touches the DOM on the server.
import { render as ssr } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Markdown from './Markdown.svelte';

const FENCE = '```mermaid\ngraph TD\n  A --> B\n```';

describe('markdown widget, SSR', () => {
	it('renders math and diagram source without a DOM', () => {
		const { body } = ssr(Markdown, { props: { content: `Speedup $S = 1/(1-p)$\n\n$$x^2$$\n\n${FENCE}` } });
		expect(body).toContain('class="ripple-math"');
		expect(body).toContain('$S = 1/(1-p)$');
		expect(body).toContain('class="ripple-diagram"');
		expect(body).toContain('A --&gt; B');
	});
});
