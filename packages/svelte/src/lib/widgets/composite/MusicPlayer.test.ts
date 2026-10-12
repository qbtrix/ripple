// widgets/composite/MusicPlayer.test.ts: the music-player data widget in
// jsdom (no AudioContext, so no sound): caps and fallbacks, the transport,
// the clock moving to the next track, keyboard, the bound value, and stream
// parity through the registry.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MusicPlayer from './MusicPlayer.svelte';
import { toPreset } from './music-engine.js';
import { expectStreamParity } from '../../streaming/__fixtures__/stream-parity.js';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const tracks = [
	{ title: 'Soft rain', sound: 'rain', minutes: 1 },
	{ title: 'Late keys', artist: 'Studio', sound: 'lofi', minutes: 2, color: 'violet' },
	{ title: 'Still water', sound: 'ocean', minutes: 0.5 } // clamps to 1 minute
];
const title = (c: HTMLElement) => c.querySelector('[data-slot="track-title"]')!.textContent;

describe('music-player', () => {
	it('falls back to drone for an unknown sound', () => {
		expect(toPreset('rain')).toBe('rain');
		expect(toPreset('https://x.example/a.mp3')).toBe('drone');
		expect(toPreset(undefined)).toBe('drone');
	});

	it('caps tracks at 30, the title at 80 and clamps minutes to 1..60', () => {
		const many = Array.from({ length: 40 }, (_, i) => ({ title: `T${i}`, sound: 'piano', minutes: i === 0 ? 999 : 0.1 }));
		const { container } = render(MusicPlayer, { props: { title: 'x'.repeat(120), tracks: many } });
		expect(container.querySelectorAll('[data-slot="track"]')).toHaveLength(30);
		expect(container.querySelector('h2')!.textContent).toHaveLength(80);
		expect(container.querySelector('[data-slot="length"]')!.textContent).toBe('60:00');
		expect(container.querySelectorAll('[data-slot="track"]')[1].textContent).toContain('1:00');
	});

	it('plays without an AudioContext, moves to the next track at the end and writes value', async () => {
		vi.useFakeTimers();
		const onchange = vi.fn();
		const { container } = render(MusicPlayer, { props: { tracks, onchange } });
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		expect(onchange).toHaveBeenLastCalledWith({ index: 0, playing: true, shuffle: false, repeat: false });
		expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
		vi.advanceTimersByTime(30_000);
		await tick();
		expect(container.querySelector('[data-slot="elapsed"]')!.textContent).toBe('0:30');
		vi.advanceTimersByTime(31_000);
		await tick();
		expect(title(container)).toBe('Late keys');
		expect(onchange).toHaveBeenLastCalledWith({ index: 1, playing: true, shuffle: false, repeat: false });
	});

	it('stops at the top after the last track unless repeat is on', async () => {
		vi.useFakeTimers();
		const { container } = render(MusicPlayer, { props: { tracks, value: { index: 2, playing: false, shuffle: false, repeat: false } } });
		await tick();
		expect(title(container)).toBe('Still water');
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		vi.advanceTimersByTime(61_000);
		await tick();
		expect(title(container)).toBe('Soft rain');
		expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
	});

	it('next, previous, a playlist row and the keyboard change the track', async () => {
		const { container } = render(MusicPlayer, { props: { tracks } });
		await fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
		expect(title(container)).toBe('Late keys');
		await fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
		expect(title(container)).toBe('Soft rain');
		await fireEvent.click(screen.getByRole('button', { name: 'Play Still water' }));
		expect(title(container)).toBe('Still water');
		expect(container.querySelector('[aria-current="true"]')!.textContent).toContain('Still water');
		const root = container.querySelector('[data-widget="music-player"]') as HTMLElement;
		await fireEvent.keyDown(root, { key: ' ' });
		expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
		await fireEvent.keyDown(root, { key: 'ArrowRight' });
		expect(title(container)).toBe('Soft rain');
	});

	it('autoplay only marks the play button', () => {
		render(MusicPlayer, { props: { tracks, autoplay: true } });
		const play = screen.getByRole('button', { name: 'Play' });
		expect(play.dataset.autoplay).toBe('true');
	});

	it('streams to the same card as a whole spec', async () => {
		await expectStreamParity({ ui: { type: 'music-player', props: { title: 'Focus mix', tracks } } });
	});
});
