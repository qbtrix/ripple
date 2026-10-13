// widgets/interactive/TodoList.sound.test.ts: checking a todo off plays the
// soft `check` cue; unchecking one, or sound false, stays silent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { playCue } from '$lib/sound/index.js';
import TodoList from './TodoList.svelte';

vi.mock('$lib/sound/index.js', () => ({ playCue: vi.fn() }));
afterEach(() => {
	cleanup();
	vi.mocked(playCue).mockClear();
});

const item = (done: boolean) => [{ id: 'a', text: 'Buy milk', done }];

describe('todo-list: sound', () => {
	it('checking an item off pops', async () => {
		render(TodoList, { props: { items: item(false) } });
		await fireEvent.click(screen.getByRole('checkbox'));
		expect(playCue).toHaveBeenCalledWith('check');
	});

	it('unchecking, or sound false, is silent', async () => {
		render(TodoList, { props: { items: item(true) } });
		await fireEvent.click(screen.getByRole('checkbox'));
		cleanup();
		render(TodoList, { props: { items: item(false), sound: false } });
		await fireEvent.click(screen.getByRole('checkbox'));
		expect(playCue).not.toHaveBeenCalled();
	});
});
