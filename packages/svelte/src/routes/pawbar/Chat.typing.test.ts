// routes/pawbar/Chat.typing.test.ts — A chip types its prompt into the composer
// before it sends, so the visitor sees a question being asked. Pins: nothing is
// sent on the click, the field grows to the whole prompt, then one send with the
// prompt and an empty field; chips, Enter and Send are inert while it types;
// typing in the field or Stop cancels with nothing sent; reduced motion sends at
// once. Fake timers drive the typing.

import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Chat from './Chat.svelte';
import { ChatSession } from './session.svelte.js';

const PROMPT = 'Make me a tip splitter for four friends at dinner';

function setup() {
	const sent: string[] = [];
	const session = new ChatSession(async function* (message) {
		sent.push(message);
		yield { event: 'stream_end', data: { cancelled: false } };
	});
	const view = render(Chat, {
		session,
		typedLocal: true,
		suggestions: [
			{ id: 'tip', title: 'Split the bill', prompt: PROMPT },
			{ id: 'other', title: 'Other', prompt: 'Something else' }
		]
	});
	const field = view.getByRole('textbox') as HTMLTextAreaElement;
	return { sent, view, field };
}

beforeEach(() => {
	Element.prototype.scrollTo = () => {};
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test('a chip types its prompt into the composer, then sends it once', async () => {
	vi.useFakeTimers();
	const { sent, view, field } = setup();
	await fireEvent.click(view.getByRole('button', { name: 'Split the bill' }));
	expect(sent).toEqual([]);

	const seen: string[] = [];
	for (let i = 0; i < 200 && field.value !== PROMPT; i++) {
		await vi.advanceTimersByTimeAsync(20);
		seen.push(field.value);
	}
	expect(field.value).toBe(PROMPT);
	expect(sent).toEqual([]);
	// It grew a little at a time, never shrinking, and within about 1.2s.
	expect(new Set(seen).size).toBeGreaterThan(10);
	expect(seen.every((v, i) => PROMPT.startsWith(v) && (i === 0 || v.length >= seen[i - 1].length))).toBe(true);
	expect(seen.length * 20).toBeLessThanOrEqual(1400);

	await vi.advanceTimersByTimeAsync(400);
	expect(sent).toEqual([PROMPT]);
	expect(field.value).toBe('');
});

test('while it types, other chips and Enter do nothing', async () => {
	vi.useFakeTimers();
	const { sent, view, field } = setup();
	await fireEvent.click(view.getByRole('button', { name: 'Split the bill' }));
	await vi.advanceTimersByTimeAsync(100);
	expect((view.getByRole('button', { name: 'Other' }) as HTMLButtonElement).disabled).toBe(true);
	await fireEvent.keyDown(field, { key: 'Enter' });
	await vi.advanceTimersByTimeAsync(3000);
	expect(sent).toEqual([PROMPT]);
});

test('Stop while it types cancels: nothing sent, the field cleared', async () => {
	vi.useFakeTimers();
	const { sent, view, field } = setup();
	await fireEvent.click(view.getByRole('button', { name: 'Split the bill' }));
	await vi.advanceTimersByTimeAsync(100);
	await fireEvent.click(view.getByRole('button', { name: 'Stop' }));
	await vi.advanceTimersByTimeAsync(3000);
	expect(sent).toEqual([]);
	expect(field.value).toBe('');
	expect((view.getByRole('button', { name: 'Split the bill' }) as HTMLButtonElement).disabled).toBe(false);
});

test('typing in the field while it types cancels the chip send', async () => {
	vi.useFakeTimers();
	const { sent, view, field } = setup();
	await fireEvent.click(view.getByRole('button', { name: 'Split the bill' }));
	await vi.advanceTimersByTimeAsync(100);
	await fireEvent.keyDown(field, { key: 'h' });
	await fireEvent.input(field, { target: { value: 'h' } });
	await vi.advanceTimersByTimeAsync(3000);
	expect(sent).toEqual([]);
	expect(field.value).toBe('h');
});

test('reduced motion: a chip sends at once, nothing typed', async () => {
	vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
	const { sent, view, field } = setup();
	await fireEvent.click(view.getByRole('button', { name: 'Split the bill' }));
	await vi.waitFor(() => expect(sent).toEqual([PROMPT]));
	expect(field.value).toBe('');
});
