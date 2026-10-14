// widgets/data/Calendar.test.ts: the mounted calendar. It opens on the period
// with the events, draws only real weeks, never nests a button in a button,
// shows undated events in a footer line, survives a bad locale and value,
// jumps from an empty month, and hands on_select the model's own object.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Calendar from './Calendar.svelte';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 9, 14));
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const MAY = [
	{ id: 1, title: 'Sprint Start', start: '2026-05-05', color: '#3b82f6' },
	{ id: 2, title: 'Review', start: '2026-05-12', color: '#8b5cf6' },
	{ id: 3, title: 'Release', start: '2026-05-19', color: '#22c55e' }
];

describe('calendar', () => {
	it('opens on the month with the events and draws its six weeks', () => {
		const { container } = render(Calendar, { props: { events: MAY } });
		expect(container.querySelector('h2')!.textContent).toBe('May 2026');
		expect(container.querySelectorAll('.cal-week')).toHaveLength(6);
		expect(container.querySelector('[data-slot="count"]')!.textContent).toBe('3 events');
		expect(container.textContent).toContain('Today');
	});

	it('never nests interactive controls and keeps one day tab stop', () => {
		const { container } = render(Calendar, { props: { events: MAY } });
		expect(container.querySelectorAll('button button, button [role="button"]')).toHaveLength(0);
		expect(container.querySelectorAll('[data-day][tabindex="0"]')).toHaveLength(1);
	});

	it('degrades messy data visibly', () => {
		const { container } = render(Calendar, {
			props: {
				value: 'not a date',
				locale: 'xx_bad!',
				events: [
					{ id: 1, title: 'Kickoff', start: '2027-03-02', color: 'red; background:url(x)' },
					{ id: 2, title: 'Team offsite', start: 'next Tuesday' },
					{ id: 3, title: '', start: '2027-03-15' }
				] as never
			}
		});
		const text = container.textContent!;
		expect(text).toContain('1 event without a date: Team offsite');
		expect(text).toContain('Untitled event');
		expect(text).not.toMatch(/Invalid Date|NaN/);
		expect(container.innerHTML).not.toContain('url(x)');
	});

	it('jumps from an empty month back to the nearest event', async () => {
		const { container, getByLabelText } = render(Calendar, { props: { events: MAY } });
		await fireEvent.click(getByLabelText('Next month'));
		expect(container.textContent).toContain('No events in June.');
		await fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Last: May 19, Release'))!);
		expect(container.querySelector('h2')!.textContent).toBe('May 2026');
	});

	it('fires on_change with the ISO day and on_select with the raw event', async () => {
		const onchange = vi.fn();
		const onselect = vi.fn();
		const { container } = render(Calendar, { props: { events: MAY, onchange, onselect } });
		await fireEvent.click(container.querySelector('[aria-label^="Tuesday, May 12, 2026"]')!);
		expect(onchange).toHaveBeenCalledWith('2026-05-12');
		await tick();
		expect(container.querySelector('[data-agenda-day].cal-group--sel')).not.toBeNull();
		await fireEvent.click(container.querySelector('.cal-chip[aria-label="Review, May 12"]')!);
		expect(onselect).toHaveBeenCalledWith(MAY[1]);
	});

	it('week view draws one row and a spanning bar', () => {
		const { container } = render(Calendar, {
			props: { view: 'week', events: [{ id: 1, title: 'Trip', start: '2026-10-13', end: '2026-10-15' }] }
		});
		expect(container.querySelector('h2')!.textContent).toBe('Oct 11 to 17, 2026');
		expect(container.querySelectorAll('.cal-week')).toHaveLength(1);
		expect(container.querySelectorAll('.cal-chip--bar')).toHaveLength(1);
	});
});
