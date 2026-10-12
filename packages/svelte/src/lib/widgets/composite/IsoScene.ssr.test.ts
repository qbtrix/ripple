// widgets/composite/IsoScene.ssr.test.ts: iso-scene renders through
// svelte/server: the drawn parts, pins, sliders, readouts and labels all ship
// in the HTML, with no window, rAF or IntersectionObserver.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import IsoScene from './IsoScene.svelte';
import { bikeScene } from './iso-scenes.js';

describe('iso-scene SSR', () => {
	it('draws the bike drivetrain on the server', () => {
		const body = render(IsoScene, { props: bikeScene }).body.replace(/<!--[^>]*-->/g, "");
		expect(body).toContain('Bicycle drivetrain');
		expect(body.match(/data-part="/g)).toHaveLength(bikeScene.parts.length);
		expect(body).toMatch(/data-slot="readout"[^>]*>2\.10 m</);
		expect(body).toMatch(/data-slot="readout"[^>]*>25\.2 km\/h</);
		expect(body.match(/data-slot="pin"/g)).toHaveLength(4);
		expect(body).toContain('data-running="false"');
		expect(body).not.toMatch(/href=|<script|<foreignObject/i);
	});
});
