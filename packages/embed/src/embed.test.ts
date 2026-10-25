// src/embed.test.ts: mount() end to end in jsdom, through the same plugins as
// the build (lazy registry, lucide proxy, shadow CSS). Pins what hosts rely
// on: the card renders in a shadow root, update() keeps the user's state,
// setTheme() flips data-theme, destroy() leaves the element clean, a second
// mount() on the same element replaces the first, and streamed frames apply.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, tick } from 'svelte';
import { mount } from './index.js';
import { specTypes } from './registry.js';

const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => setTimeout(r, 0));
	}
	flushSync();
};

const form = (heading: string) => ({
	version: '1.0',
	state: { name: '' },
	ui: {
		type: 'flex',
		props: { direction: 'column' },
		children: [
			{ type: 'heading', props: { text: heading } },
			{ type: 'input', props: { label: 'Name' }, bind: 'state.name' },
			{ type: 'text', props: { text: 'Hi {state.name}' } }
		]
	}
});

let el: HTMLElement;
afterEach(() => el?.remove());
const host = () => {
	el = document.createElement('div');
	document.body.append(el);
	return el;
};

describe('specTypes', () => {
	it('collects every known widget type, at any depth, and skips the rest', () => {
		const types = specTypes({ ui: { type: 'card', children: [{ type: 'chart', props: { type: 'bar' } }, { type: 'nope' }] } });
		expect([...types].sort()).toEqual(['card', 'chart']);
	});
});

describe('mount', () => {
	it('renders into an open shadow root and marks the host with the theme', async () => {
		const card = mount(host(), { version: '1.0', ui: { type: 'text', props: { text: 'Hello from Ripple' } } });
		await card.ready;
		await settle();
		expect(el.shadowRoot?.textContent).toContain('Hello from Ripple');
		expect(el.dataset.theme).toBe('light');
		expect(el.shadowRoot?.querySelectorAll('style').length).toBeGreaterThan(0);
		card.destroy();
	});

	it('update() swaps the spec in place and keeps what the user typed', async () => {
		const card = mount(host(), form('Before'));
		await card.ready;
		await settle();
		const input = el.shadowRoot!.querySelector('input')!;
		input.value = 'Ada';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		expect(el.shadowRoot!.textContent).toContain('Hi Ada');

		card.update(form('After'));
		await settle();
		expect(el.shadowRoot!.textContent).toContain('After');
		expect(el.shadowRoot!.querySelector('input')).toBe(input);
		expect(el.shadowRoot!.querySelector('input')!.value).toBe('Ada');
		expect(el.shadowRoot!.textContent).toContain('Hi Ada');
		card.destroy();
	});

	it('setTheme() switches data-theme and the wrapper class without a remount', async () => {
		const card = mount(host(), form('Theme'), { theme: 'dark' });
		await card.ready;
		await settle();
		const wrapper = el.shadowRoot!.querySelector('.ripple-embed-root')!;
		expect(el.dataset.theme).toBe('dark');
		expect(wrapper.classList.contains('dark')).toBe(true);
		card.setTheme('light');
		await settle();
		expect(el.dataset.theme).toBe('light');
		expect(el.shadowRoot!.querySelector('.ripple-embed-root')).toBe(wrapper);
		expect(wrapper.classList.contains('dark')).toBe(false);
		card.destroy();
	});

	it('destroy() empties the root, and a second mount replaces the first', async () => {
		const first = mount(host(), form('One'));
		await first.ready;
		const second = mount(el, form('Two'));
		await second.ready;
		await settle();
		expect(el.shadowRoot!.querySelectorAll('.ripple-embed-root').length).toBe(1);
		expect(el.shadowRoot!.textContent).toContain('Two');
		second.destroy();
		expect(el.shadowRoot!.childNodes.length).toBe(0);
		expect(el.dataset.theme).toBeUndefined();
	});

	it('streams partial JSON text and settles on finish()', async () => {
		const full = JSON.stringify({ version: '1.0', ui: { type: 'text', props: { text: 'Streamed answer' } } });
		const card = mount(host(), full.slice(0, 30), { streaming: true });
		await card.ready;
		card.update(full);
		await settle();
		expect(el.shadowRoot!.textContent).toContain('Streamed answer');
		expect(el.shadowRoot!.querySelector('[data-ripple-streaming]')?.getAttribute('data-ripple-streaming')).toBe('active');
		card.finish();
		await settle();
		expect(el.shadowRoot!.querySelector('[data-ripple-streaming]')?.getAttribute('data-ripple-streaming')).toBe('done');
		card.destroy();
	});

	it('emits spec events to onEvent', async () => {
		const events: unknown[] = [];
		const spec = {
			version: '1.0',
			ui: { type: 'switch', props: { label: 'Go' }, on_change: { action: 'emit', event: 'go', payload: { n: 1 } } }
		};
		const card = mount(host(), spec, { onEvent: (e) => void events.push(e) });
		await card.ready;
		await settle();
		el.shadowRoot!.querySelector<HTMLElement>('[role=switch]')!.click();
		await settle();
		expect(events).toEqual([expect.objectContaining({ type: 'emit' })]);
		card.destroy();
	});
});
