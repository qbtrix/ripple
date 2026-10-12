// widgets/composite/MusicPlayer.ssr.test.ts: music-player renders through
// svelte/server with no AudioContext: the now-playing header, the clock,
// the idle visualizer and the playlist rows all ship in the HTML.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MusicPlayer from './MusicPlayer.svelte';

describe('music-player SSR', () => {
	it('renders the first track, its length and the playlist on the server', () => {
		const { body } = render(MusicPlayer, {
			props: {
				title: 'Focus mix',
				tracks: [
					{ title: 'Soft rain', sound: 'rain', minutes: 10 },
					{ title: 'Mystery', sound: 'kazoo', minutes: 2 }
				]
			}
		});
		expect(body).toContain('Focus mix');
		expect(body).toMatch(/data-slot="track-title"[^>]*>Soft rain</);
		expect(body).toMatch(/data-slot="length"[^>]*>10:00</);
		expect(body).toContain('data-slot="visualizer"');
		expect(body).toContain('mp-idle');
		expect(body.match(/data-slot="track"/g)).toHaveLength(2);
		// Unknown sound falls back to the drone preset.
		expect(body).toContain('Drone');
	});
});
