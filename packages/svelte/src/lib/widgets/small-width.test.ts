// widgets/small-width.test.ts: the logic half of the phone-width widget fixes
// (pricing CTA events and ISO currency, the habit verdict's start day, table
// column `align`, weather's few-days row layout). The layout half needs a real
// browser and lives in e2e/widget-narrow.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import PricingTable from './vertical/PricingTable.svelte';
import HabitTracker from './composite/HabitTracker.svelte';
import WeatherForecast from './composite/WeatherForecast.svelte';
import Table from './data/Table.svelte';
import { startDay, targetSince, weekDays } from './composite/habit-tracker.js';

vi.mock('$lib/sound/index.js', () => ({ playCue: vi.fn() }));

afterEach(() => cleanup());

const TIERS = [
	{ id: 'free', name: 'Free', price: 0, period: '/month', cta: 'Start free' },
	{ id: 'team', name: 'Team', price: 8, period: 'month', cta: 'Try Team' },
	{ id: 'biz', name: 'Business', price: 12.5, period: 'per month', cta: 'Contact sales', actions: { action: 'set' as const, target: 'via', value: 'tier-actions' } }
];

describe('pricing-table', () => {
	it('formats numeric prices with an ISO code, no cents on whole numbers', () => {
		const { container } = render(PricingTable, { props: { tiers: TIERS, currency: 'EUR' } });
		const text = container.textContent!.replace(/\s+/g, ' ');
		expect(text).toContain('€0');
		expect(text).toContain('€8');
		expect(text).toContain('€12.50');
		expect(text).not.toContain('EUR');
	});

	it('keeps a symbol as a prefix, and never doubles the period slash', () => {
		const { container } = render(PricingTable, { props: { tiers: TIERS, currency: '£' } });
		const text = container.textContent!.replace(/\s+/g, ' ');
		expect(text).toContain('£8');
		expect(text).not.toContain('//');
		expect(text).toContain('/month');
		expect(text).toContain('per month');
	});

	it('fires the spec on_select with { id, name }, and a tier\'s own actions instead when set', async () => {
		render(Ripple, {
			props: {
				spec: {
					state: { picked: 'none', via: 'none' },
					ui: {
						type: 'flex',
						children: [
							{ type: 'pricing-table', props: { currency: 'USD', tiers: TIERS }, on_select: { action: 'set', target: 'picked', value: '{event.name}' } },
							{ type: 'text', props: { text: 'picked={state.picked} via={state.via}' } }
						]
					}
				}
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Try Team' }));
		expect(await screen.findByText('picked=Team via=none')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Contact sales' }));
		expect(await screen.findByText('picked=Team via=tier-actions')).toBeTruthy();
	});

	it('flips between one row and one column on its own width, never a 2 + 1 orphan', () => {
		const { container } = render(PricingTable, { props: { tiers: TIERS } });
		const cols = (container.querySelector('[data-widget="pricing-table"]') as HTMLElement).style.gridTemplateColumns;
		expect(cols).toContain('auto-fit');
		expect(cols).toContain('clamp(');
		expect(cols).toContain('35rem'); // 3 x 11rem + 2 gaps
	});
});

describe('habit-tracker start day', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 16, 10, 30)); // Friday 16 October
	});
	afterEach(() => vi.useRealTimers());

	const week = weekDays('2026-10-12');

	it('starts at the earliest tick, else today, and owes only the days since', () => {
		expect(startDay({ a: [], b: [] }, '2026-10-16')).toBe('2026-10-16');
		expect(startDay({ a: ['2026-10-14'], b: ['2026-10-01', '2026-10-15'] }, '2026-10-16')).toBe('2026-10-01');
		expect(targetSince(7, week, '2026-10-16')).toBe(3); // Fri, Sat, Sun
		expect(targetSince(2, week, '2026-10-16')).toBe(2);
		expect(targetSince(7, week, '2026-10-01')).toBe(7);
	});

	it('does not call a fresh tracker behind on its first day', () => {
		render(HabitTracker, { props: { habits: [{ id: 'water', name: 'Drink water', target_per_week: 7 }] } });
		expect(screen.getByText('1 of 1 habit on track this week')).toBeTruthy();
	});

	it('still owes the whole week once the tracker is older than it', () => {
		// A tick 10 days ago puts the start last week, so Monday to Thursday count.
		render(HabitTracker, { props: { habits: [{ id: 'water', name: 'Drink water', target_per_week: 7 }], seed: { water: [10] } } });
		expect(screen.getByText('0 of 1 habit on track this week')).toBeTruthy();
	});
});

describe('table column align', () => {
	it('honours align over the all-number default, on header and cells', () => {
		const { container } = render(Table, {
			props: {
				columns: [
					{ key: 'name', label: 'Name', align: 'right' },
					{ key: 'n', label: 'N', align: 'left' },
					{ key: 'm', label: 'M' }
				],
				data: [{ name: 'a', n: 1, m: 2 }]
			}
		});
		const heads = [...container.querySelectorAll('th')];
		const cells = [...container.querySelectorAll('td')];
		expect(heads[0].className).toContain('text-right');
		expect(cells[0].className).toContain('text-right');
		expect(heads[1].className).not.toContain('text-right');
		expect(cells[1].className).toContain('text-left');
		expect(cells[2].className).toContain('text-right'); // numeric default kept
	});
});

describe('weather-forecast day layout', () => {
	const day = (d: string) => ({ day: d, condition: 'sunny', high: 20, low: 10 });
	it('keeps one or two days as rows; three or more may stand side by side', () => {
		const one = render(WeatherForecast, { props: { place: 'Lisbon', days: [day('Mon')] } });
		expect(one.container.querySelector('[data-slot="days"]')!.getAttribute('data-many')).toBe('false');
		cleanup();
		const three = render(WeatherForecast, { props: { place: 'Lisbon', days: [day('Mon'), day('Tue'), day('Wed')] } });
		expect(three.container.querySelector('[data-slot="days"]')!.getAttribute('data-many')).toBe('true');
	});
});
