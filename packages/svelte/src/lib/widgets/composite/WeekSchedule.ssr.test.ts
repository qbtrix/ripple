// widgets/composite/WeekSchedule.ssr.test.ts: week-schedule renders through
// svelte/server on a fixed clock: blocks carry their spoken labels, today's
// column is marked and the current-time line sits in it.
import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeekSchedule from './WeekSchedule.svelte';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 9, 14, 14, 0)); // a Wednesday, 14:00
});
afterEach(() => vi.useRealTimers());

describe('week-schedule SSR', () => {
	it('renders the week grid with the time line on today', () => {
		const { body } = render(WeekSchedule, {
			props: {
				title: 'My week',
				events: [
					{ day: 'Wed', start: '13:00', end: '15:00', title: 'Workshop', place: 'Lab' },
					{ day: 'Fri', start: '09:00', end: '09:30', title: 'Standup' }
				]
			}
		});
		expect(body).toContain('My week');
		expect(body).toContain('2 events · 2 h 30 min booked');
		expect(body).toContain('aria-label="Workshop, Wed 13:00 to 15:00, Lab"');
		expect(body).toContain('data-slot="now-line"');
		expect(body).toContain('Wed · Today');
	});
});
