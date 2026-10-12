// widgets/composite/WeekSchedule.test.ts: the week-schedule widget: registry
// and bind contract, time and day parsing, lanes for overlapping events,
// selecting an event (details, onchange, bound state through Ripple), and
// streamed parity with id-less and half-written events.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Ripple from '$lib/Ripple.svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget } from '../index.js';
import { getBindContract, warnUnregisteredBindContract, _resetBindContractWarnings } from '@ripple-ui/core';
import WeekSchedule from './WeekSchedule.svelte';
import { DEFAULT_DAYS, PALETTE, colorOf, dayIndex, lanes, readEvents, toMin } from './week-schedule.js';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const events = [
	{ id: 'deep', day: 'Mon', start: '09:00', end: '12:30', title: 'Deep work', color: 'blue' },
	{ id: 'review', day: 'Thursday', start: '10:00', end: '11:00', title: 'Design review' },
	{ id: 'one', day: 'thu', start: '10:30', end: '11:30', title: '1:1 with Sam', place: 'Room 2' },
	{ id: 'dinner', day: 'Sun', start: '19:00', end: '21:00', title: 'Family dinner', color: 'url(evil)' }
];

describe('week-schedule: data', () => {
	it('registers under its type and aliases, bound on value', () => {
		expect(getWidget('week-schedule')).toBe(WeekSchedule);
		expect(getWidget('weekly-schedule')).toBe(WeekSchedule);
		expect(getWidget('timetable')).toBe(WeekSchedule);
		expect(getBindContract('week-schedule')).toEqual({ prop: 'value', event: 'onchange' });
		_resetBindContractWarnings();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		warnUnregisteredBindContract('week-schedule');
		expect(warn).not.toHaveBeenCalled();
	});

	it('reads times and days', () => {
		expect(toMin('09:30')).toBe(570);
		expect(toMin('2pm')).toBe(840);
		expect(toMin('12:15 AM')).toBe(15);
		expect(toMin('25:00')).toBeUndefined();
		expect(dayIndex('Wednesday', DEFAULT_DAYS)).toBe(2);
		expect(dayIndex('SUN', DEFAULT_DAYS)).toBe(6);
		expect(dayIndex('Mo', DEFAULT_DAYS)).toBe(-1);
	});

	it('lays overlapping events side by side and keeps colours in the palette', () => {
		const bs = readEvents(events, DEFAULT_DAYS, 7 * 60, 21 * 60);
		const thu = lanes(bs.filter((b) => b.day === 3));
		expect(thu.get('review')).toEqual({ lane: 0, of: 2 });
		expect(thu.get('one')).toEqual({ lane: 1, of: 2 });
		expect(lanes(bs.filter((b) => b.day === 0)).get('deep')).toEqual({ lane: 0, of: 1 });
		expect(Object.values(PALETTE)).toContain(bs.find((b) => b.id === 'dinner')!.color);
		expect(colorOf('blue', 'x')).toBe(PALETTE.blue);
		expect(readEvents([{ day: 'Mon', start: '06:00', end: '06:30', title: 'Early' }, { day: 'Funday', start: '09:00' }], DEFAULT_DAYS, 420, 1260)).toEqual([]);
	});
});

describe('week-schedule: behaviour', () => {
	it('opens details on press and reports the selected id', async () => {
		const onchange = vi.fn();
		const { container } = render(WeekSchedule, { props: { title: 'My week', events, onchange } });
		const block = container.querySelector('[data-slot="grid"] [data-event="one"]') as HTMLElement;
		expect(block.getAttribute('style')).toMatch(/left: ?50%/);
		await fireEvent.click(block);
		expect(onchange).toHaveBeenLastCalledWith('one');
		const detail = container.querySelector('[data-slot="detail"]')!;
		expect(detail.textContent).toContain('1:1 with Sam');
		expect(detail.textContent).toContain('Thu, 10:30 to 11:30');
		expect(detail.textContent).toContain('Room 2');
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onchange).toHaveBeenLastCalledWith(null);
		expect(container.querySelector('[data-slot="detail"]')).toBeNull();
		expect(container.querySelectorAll('[data-slot="list"] [data-event]')).toHaveLength(4);
	});

	it('writes the selected id to bound state', async () => {
		const { container } = render(Ripple, { props: { spec: { state: { picked: null }, ui: { type: 'week-schedule', bind: '{state.picked}', props: { events } } } } });
		await fireEvent.click(container.querySelector('[data-slot="grid"] [data-event="deep"]')!);
		await tick();
		expect(container.querySelector('[data-slot="detail"]')?.textContent).toContain('Deep work');
	});

	it('streams with id-less and half-written events and ends equal to the whole render', async () => {
		await expectStreamParity({
			ui: { type: 'week-schedule', props: { title: 'My week', events: [{ day: 'Mon', start: '09:00', end: '10:00', title: 'Standup' }, {}, events[1], events[2], { day: 'Fri' }] } }
		});
	});
});
