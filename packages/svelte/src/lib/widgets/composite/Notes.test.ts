// widgets/composite/Notes.test.ts: the notes data widget: the parsing, caps
// and filtering in notes.ts, registry / bind-contract / manifest wiring,
// writing (Enter, Cmd+Enter, blur, Esc), inline #tags, edit in place, pin,
// delete with undo, tag filters, search past six notes, streamed parity and
// junk props.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { manifestEntries } from '$lib/manifest/index.js';
import { getWidget, hasWidget } from '../index.js';
import { _resetBindContractWarnings, getBindContract, warnUnregisteredBindContract } from '@ripple-ui/core';
import Notes from './Notes.svelte';
import { MAX_NOTES, MAX_TEXT, MAX_TITLE, ago, allTags, asDraft, fromDraft, matches, ordered, parseTags, readNotes, type NotesValue } from './notes.js';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const TYPES = ['notes', 'notepad', 'sticky-notes'];
const SEED = () => [
	{ id: 'a', title: 'Market stall', text: 'Lemon cookies first', tags: ['idea'] },
	{ id: 'b', title: 'Call venue', text: 'Ask about Saturday', tags: ['todo'] }
];
const lastValue = (fn: ReturnType<typeof vi.fn>) => fn.mock.lastCall?.[0] as NotesValue;
const titles = (c: Element) => [...c.querySelectorAll('[data-note] h3')].map((h) => h.textContent?.trim());
const newNote = () => screen.getByRole('textbox', { name: 'New note' });

async function write(title: string, text?: string) {
	await fireEvent.focusIn(newNote());
	await fireEvent.input(newNote(), { target: { value: title } });
	if (text !== undefined) await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: text } });
}

describe('notes: parsing and caps', () => {
	it('pulls #tags out of the writing, lowercased, deduped, not mid-word', () => {
		expect(parseTags('Ship it #Idea and #todo, also #idea')).toEqual({ text: 'Ship it and, also', tags: ['idea', 'todo'] });
		expect(parseTags('see site.com/#anchor and C#')).toEqual({ text: 'see site.com/#anchor and C#', tags: [] });
		expect(parseTags('line one\n#tag line two')).toEqual({ text: 'line one\nline two', tags: ['tag'] });
	});

	it('reads model notes: strings, junk, unique ids, colours, caps', () => {
		const notes = readNotes(['plain string', null, { title: '' }, { id: 'x', text: 'a' }, { id: 'x', text: 'b', color: 'purple', pinned: 'yes' }, { title: 'T'.repeat(200), text: 'y'.repeat(5000), tags: ['#A', 'b c', 'ok'] }]);
		expect(notes.map((n) => n.id)).toEqual(['n1', 'x', 'x-4', 'n6']);
		expect(notes[2]).toMatchObject({ color: 'plain', pinned: false });
		expect(notes[3].title).toHaveLength(MAX_TITLE);
		expect(notes[3].text).toHaveLength(MAX_TEXT);
		expect(notes[3].tags).toEqual(['a', 'ok']);
		expect(readNotes(Array.from({ length: 80 }, (_, i) => `n ${i}`))).toHaveLength(MAX_NOTES);
	});

	it('round-trips a note through the editor draft', () => {
		const [n] = readNotes([{ title: 'T', text: 'Body', tags: ['idea'] }]);
		const d = asDraft(n);
		expect(d.text).toBe('Body\n#idea');
		expect(fromDraft(d.title, d.text)).toEqual({ title: 'T', text: 'Body', tags: ['idea'] });
		expect(fromDraft('  ', '\n')).toBeNull();
	});

	it('orders pinned first, filters by tag and query, lists tags by use', () => {
		const notes = readNotes([{ id: 'a', text: 'x', tags: ['b'] }, { id: 'p', text: 'y', pinned: true, tags: ['a', 'b'] }]);
		expect(ordered(notes).map((n) => n.id)).toEqual(['p', 'a']);
		expect(allTags(notes, ['z', 'a'])).toEqual(['b', 'a', 'z']);
		expect(matches(notes[0], 'a', '')).toBe(false);
		expect(matches(notes[1], 'a', 'Y')).toBe(true);
	});

	it('labels time relative to now', () => {
		expect(ago(1000, 30_000)).toBe('just now');
		expect(ago(0, 5 * 60_000)).toBe('5 min ago');
		expect(ago(0, 3 * 3_600_000)).toBe('3 h ago');
		expect(ago(0, 2 * 86_400_000)).toBe('2 d ago');
	});
});

describe('notes: registry, bind contract, manifest', () => {
	it('resolves the type and every alias to one component', () => {
		for (const t of TYPES) {
			expect(hasWidget(t)).toBe(true);
			expect(getWidget(t)).toBe(getWidget('notes'));
		}
	});

	it('binds value through onchange without the unregistered warning', () => {
		_resetBindContractWarnings();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		for (const t of TYPES) {
			expect(getBindContract(t)).toEqual({ prop: 'value', event: 'onchange' });
			warnUnregisteredBindContract(t);
		}
		expect(warn).not.toHaveBeenCalled();
	});

	it('has a manifest entry whose example renders its two notes, pinned first', () => {
		const entry = manifestEntries.find((e) => e.type === 'notes')!;
		expect(entry.description.length).toBeLessThan(200);
		expect(Object.keys(entry.props)).toEqual(['title', 'notes', 'tags', 'placeholder']);
		const { container } = render(Ripple, { props: { spec: { state: {}, ui: entry.example } } });
		expect(container.querySelectorAll('[data-note]')).toHaveLength(2);
		expect(container.querySelector('[data-note]')?.hasAttribute('data-pinned')).toBe(true);
	});
});

describe('notes: writing', () => {
	it('is not a form: no Add button, no labelled fields, no form element', () => {
		const { container } = render(Notes, { props: { notes: SEED() } });
		expect(container.querySelector('form')).toBeNull();
		expect(screen.queryByRole('button', { name: /^add( note)?$/i })).toBeNull();
		expect(newNote().getAttribute('placeholder')).toBe('Write a note…');
	});

	it('Enter on the title saves, with #tags as chips, on top, and keeps writing', async () => {
		const onchange = vi.fn();
		const { container } = render(Notes, { props: { notes: SEED(), onchange } });
		await write('Buy oat milk #errand');
		await fireEvent.keyDown(newNote(), { key: 'Enter' });
		const v = lastValue(onchange);
		expect(v.notes[0]).toMatchObject({ title: 'Buy oat milk', text: '', tags: ['errand'], pinned: false, color: 'plain' });
		expect(typeof v.notes[0].at).toBe('number');
		expect(titles(container)[0]).toBe('Buy oat milk');
		expect(container.querySelector('[data-note] [data-slot="time"]')?.textContent).toBe('just now');
		expect((newNote() as HTMLInputElement).value).toBe('');
		expect(screen.getByRole('button', { name: '#errand' })).toBeTruthy();
	});

	it('Cmd or Ctrl+Enter in the body saves; Shift+Enter on the title does not', async () => {
		const onchange = vi.fn();
		render(Notes, { props: { onchange } });
		await write('Title', 'Line one\nLine two #idea');
		await fireEvent.keyDown(newNote(), { key: 'Enter', shiftKey: true });
		expect(onchange).not.toHaveBeenCalled();
		await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note' }), { key: 'Enter', ctrlKey: true });
		expect(lastValue(onchange).notes[0]).toMatchObject({ title: 'Title', text: 'Line one\nLine two', tags: ['idea'] });
	});

	it('leaving the writing area with something in it saves; Esc cancels', async () => {
		const onchange = vi.fn();
		render(Notes, { props: { onchange } });
		await write('Kept');
		await fireEvent.focusOut(newNote(), { relatedTarget: null });
		expect(lastValue(onchange).notes.map((n) => n.title)).toEqual(['Kept']);

		await write('Thrown away');
		await fireEvent.keyDown(newNote(), { key: 'Escape' });
		expect((newNote() as HTMLInputElement).value).toBe('');
		expect(onchange).toHaveBeenCalledTimes(1);
	});

	it('a new note written under a tag filter carries that tag', async () => {
		const onchange = vi.fn();
		render(Notes, { props: { notes: SEED(), onchange } });
		await fireEvent.click(screen.getByRole('button', { name: '#todo' }));
		await write('Book the van');
		await fireEvent.keyDown(newNote(), { key: 'Enter' });
		expect(lastValue(onchange).notes[0].tags).toEqual(['todo']);
	});
});

describe('notes: cards', () => {
	it('edits a note in place and saves on Enter', async () => {
		const onchange = vi.fn();
		const { container } = render(Notes, { props: { notes: SEED(), onchange } });
		await fireEvent.click(screen.getByRole('button', { name: 'Market stall' }));
		const t = screen.getByRole('textbox', { name: 'Edit Market stall' }) as HTMLInputElement;
		expect(t.value).toBe('Market stall');
		expect((screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement).value).toBe('Lemon cookies first\n#idea');
		await fireEvent.input(t, { target: { value: 'Market stall #weekend' } });
		await fireEvent.keyDown(t, { key: 'Enter' });
		expect(lastValue(onchange).notes[0]).toMatchObject({ id: 'a', title: 'Market stall', tags: ['weekend', 'idea'] });
		expect(container.querySelector('[data-slot="editor"]')).toBeNull();
	});

	it('Esc leaves an edit untouched', async () => {
		const onchange = vi.fn();
		render(Notes, { props: { notes: SEED(), onchange } });
		await fireEvent.click(screen.getByRole('button', { name: 'Call venue' }));
		const t = screen.getByRole('textbox', { name: 'Edit Call venue' });
		await fireEvent.input(t, { target: { value: 'Changed' } });
		await fireEvent.keyDown(t, { key: 'Escape' });
		expect(onchange).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Call venue' })).toBeTruthy();
	});

	it('pins a note to the top and unpins it', async () => {
		const { container } = render(Notes, { props: { notes: SEED() } });
		const pin = screen.getByRole('button', { name: 'Pin Call venue' });
		expect(pin.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(pin);
		expect(titles(container)).toEqual(['Call venue', 'Market stall']);
		await fireEvent.click(screen.getByRole('button', { name: 'Unpin Call venue' }));
		expect(titles(container)).toEqual(['Market stall', 'Call venue']);
	});

	it('deletes without a confirm and undoes back into place', async () => {
		vi.useFakeTimers();
		const onchange = vi.fn();
		const { container } = render(Notes, { props: { notes: SEED(), onchange } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Market stall' }));
		expect(titles(container)).toEqual(['Call venue']);
		expect(lastValue(onchange).notes.map((n) => n.id)).toEqual(['b']);
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(titles(container)).toEqual(['Market stall', 'Call venue']);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Call venue' }));
		await vi.advanceTimersByTimeAsync(7000);
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
	});

	it('filters by tag with one All chip, and shows search only past six notes', async () => {
		const { container, rerender } = render(Notes, { props: { notes: SEED(), tags: ['later'] } });
		expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
		// Suggested tags are offered in the editor, not as filters over nothing.
		expect(screen.queryByRole('button', { name: '#later' })).toBeNull();
		expect(screen.queryByRole('searchbox')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: '#idea' }));
		expect(titles(container)).toEqual(['Market stall']);
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));
		expect(titles(container)).toHaveLength(2);

		await rerender({ notes: Array.from({ length: 8 }, (_, i) => ({ title: `Note ${i}`, text: i === 3 ? 'needle' : 'hay' })) });
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'NEEDLE' } });
		expect(titles(container)).toEqual(['Note 3']);
	});

	it('keeps edits when the host re-sends the same spec (bound and unbound)', async () => {
		const spec = { state: {}, ui: { type: 'notes', bind: '{state.notes}', props: { notes: SEED() } } };
		const { container, rerender } = render(Ripple, { props: { spec } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Market stall' }));
		await rerender({ spec: structuredClone(spec) });
		expect(titles(container)).toEqual(['Call venue']);
	});

	it('stops taking notes at the cap', () => {
		render(Notes, { props: { notes: Array.from({ length: 50 }, (_, i) => ({ text: `n${i}` })) } });
		expect(screen.queryByRole('textbox', { name: 'New note' })).toBeNull();
		expect(screen.getByText(/This pad holds 50 notes/)).toBeTruthy();
	});
});

describe('notes: streaming', () => {
	it('streams with id-less, string and half-written notes and ends equal to the whole render', async () => {
		await expectStreamParity({
			state: {},
			ui: {
				type: 'notes',
				bind: '{state.notes}',
				props: {
					title: 'Ideas',
					tags: ['idea', 'todo'],
					notes: [
						{ id: 'n1', title: 'Market stall', text: 'Lemon cookies first', tags: ['idea'], pinned: true, color: 'yellow' },
						{ title: 'Call venue', text: 'Ask about Saturday', tags: ['todo'], color: 'blue' },
						{},
						'Just a string note'
					]
				}
			}
		});
	});
});

describe('notes: junk props', () => {
	it.each([
		['wrong types everywhere', { notes: 'x', tags: 'y', title: 7, placeholder: {}, value: 'z' }],
		['junk rows', { notes: [null, 3, { title: { x: 1 } }, { text: 'ok', tags: 'idea', color: 9 }] }],
		['a junk bound value', { notes: SEED(), value: { notes: [{ text: 5 }, 'fine'] } }],
		['nothing at all', {}]
	])('%s renders without throwing', (_name, props) => {
		const { container } = render(Notes, { props: props as never });
		expect(container.querySelector('[data-widget="notes"]')).not.toBeNull();
	});
});
