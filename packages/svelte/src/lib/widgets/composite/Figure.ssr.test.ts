// widgets/composite/Figure.ssr.test.ts: `figure` renders through svelte/server
// with no DOM: the frame, the catalog title, the stage, the caption and the
// label list ship in the HTML; the geometry loads later in the browser.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Figure from './Figure.svelte';

describe('figure SSR', () => {
	it('renders the frame, title, caption and labels on the server', () => {
		const { body } = render(Figure, { props: { figure: 'heart', labels: [{ anchor: 'aorta', label: 'Aorta' }], caption: 'Two pumps.' } });
		expect(body).toContain('How a heart pumps');
		expect(body).toContain('data-slot="figure-stage"');
		expect(body).toContain('Two pumps.');
		expect(body).toMatch(/data-slot="label"[^]*Aorta/);
	});

	it('renders the quiet placeholder for an unknown id', () => {
		const { body } = render(Figure, { props: { figure: 'unicorn' } });
		expect(body).toContain('data-slot="placeholder"');
	});
});
