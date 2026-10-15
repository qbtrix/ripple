// Gauge.ssr.test.ts: the gauge server-renders as a named meter with its value
// in the HTML (no blank first paint), and a hostile colour never reaches it.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Gauge from './Gauge.svelte';

describe('gauge SSR', () => {
	it('renders role=meter, its name, the value text and the arc', () => {
		const { body } = render(Gauge, { props: { id: 'g1', value: 4228, max: 10000, label: 'Steps' } });
		expect(body).toContain('role="meter"');
		expect(body).toContain('aria-label="Steps"');
		expect(body).toContain('aria-valuetext="4,228 of 10,000, Steps"');
		expect(body).toContain('data-ripple-node="g1"');
		expect(body).toContain('4,228');
		expect(body).toContain('of 10,000');
		expect(body.match(/<path/g)).toHaveLength(3); // cut, track, value
		expect(body).toMatch(/mask="url\(#gauge-cut-/);
	});

	it('zero draws the track only; a hostile colour falls back to the accent', () => {
		const zero = render(Gauge, { props: { value: 0, max: 500 } }).body;
		expect(zero.match(/<path/g)).toHaveLength(1);
		const bad = render(Gauge, { props: { value: 40, color: 'url(javascript:alert(1))' } }).body;
		expect(bad).not.toContain('javascript');
		expect(bad).toContain('stroke-ripple-accent');
	});
});
