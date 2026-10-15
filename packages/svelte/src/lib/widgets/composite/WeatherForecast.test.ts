// widgets/composite/WeatherForecast.test.ts: the weather-forecast widget:
// registry and aliases, condition words to icon kinds (unknown is cloudy),
// messy model fields (spec 04 of the polish brief), the colour ramp, hourly
// thinning, the unit toggle converting every number without moving a bar,
// picking a day for its details, and streamed parity with field-less days.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget } from '../index.js';
import WeatherForecast from './WeatherForecast.svelte';
import { at, bucketHours, COLD_C, convert, outlook, ramp, readDays, readHours, readNow, span, toKind, WARM_C, type Hour } from './weather-forecast.js';

afterEach(cleanup);

const days = [
	{ day: 'Mon', condition: 'partly-cloudy', high: 23, low: 16, rainChance: 10, sunrise: '07:31', sunset: '18:52' },
	{ day: 'Tue', condition: 'Light showers', high: 18, low: 14, rainChance: 70 },
	{ day: 'Wed', condition: 'volcanic ash', high: 20, low: 12 }
];

describe('weather-forecast: data', () => {
	it('registers under its type and aliases', () => {
		expect(getWidget('weather-forecast')).toBe(WeatherForecast);
		expect(getWidget('forecast')).toBe(WeatherForecast);
		expect(getWidget('weather')).toBe(WeatherForecast);
	});

	it('maps condition words to kinds, unknown to cloudy', () => {
		expect(toKind('Light showers')).toBe('rain');
		expect(toKind('Heavy rain')).toBe('heavy-rain');
		expect(toKind('Thunderstorms')).toBe('thunder');
		expect(toKind('Partly sunny')).toBe('partly-cloudy');
		expect(toKind('Clear night')).toBe('night-clear');
		expect(toKind('Mist')).toBe('fog');
		expect(toKind('volcanic ash')).toBe('cloudy');
		expect(toKind(undefined)).toBe('cloudy');
	});

	it('converts, spans and words the outlook', () => {
		expect(convert(20, 'C', 'F')).toBe(68);
		expect(convert(68, 'F', 'C')).toBe(20);
		const rows = readDays(days);
		expect(span(rows)).toEqual([12, 23]);
		expect(at(12, [12, 23])).toBe(0);
		expect(at(23, [12, 23])).toBe(100);
		expect(outlook(rows)).toBe('Rain likely on Tue.');
		expect(readDays([{ high: 5, low: 9 }])[0]).toMatchObject({ high: 9, low: 5, kind: 'cloudy' });
		expect(readDays(Array.from({ length: 20 }, () => ({})))).toHaveLength(14);
	});
});

describe('weather-forecast: messy fields', () => {
	const rows = readDays([
		{ day: 'Wednesday', condition: 'Light showers', high: 13, low: 16, rainChance: '78%' },
		{ day: '2026-10-16', condition: 'volcanic ash', high: 20, low: 12 },
		{ day: '', condition: '', low: 11, rainChance: 150 },
		{ day: 'Saturday 17 October (long weekend)', high: 15, low: 15, rainChance: -5 },
		{ day: 'sunday', rainChance: 'n/a', sunrise: '07:40 AM local time' }
	]);

	it('reads percentages, weekday names, empty days and swapped ranges', () => {
		expect(rows.map((r) => r.rain)).toEqual([78, undefined, 100, 0, undefined]);
		expect(rows.map((r) => r.day)).toEqual(['Wed', 'Fri', 'Day 3', 'Saturday 17 October (long weekend)', 'Sun']);
		expect(rows[0]).toMatchObject({ low: 13, high: 16 });
		expect(rows[2]).toMatchObject({ kind: 'cloudy', label: 'Cloudy', low: 11, high: undefined });
		expect(rows[4].sunrise).toBe('07:40 AM local time');
		expect(readNow({ temp: '9', humidity: 120, wind: 22 })).toMatchObject({ temp: 9, humidity: 100, wind: '22 km/h' });
		expect(readHours([{ time: 'Tomorrow 3 AM', temp: null }])[0]).toMatchObject({ time: 'Tomorrow 3 AM', temp: undefined });
	});

	it('stretches the span to hold the current temperature', () => {
		expect(span(rows)).toEqual([11, 20]);
		expect(span(rows, 9)).toEqual([9, 20]);
		expect(at(9, span(rows, 9)!)).toBe(0);
	});

	it('maps temperature to the colour ramp, clamped at both ends', () => {
		expect(ramp(COLD_C)).toBe(0);
		expect(ramp(COLD_C - 20)).toBe(0);
		expect(ramp(WARM_C)).toBe(100);
		expect(ramp(WARM_C + 20)).toBe(100);
		expect(ramp((COLD_C + WARM_C) / 2)).toBe(50);
		expect(ramp(5)).toBeLessThan(ramp(25));
	});
});

describe('weather-forecast: hourly buckets', () => {
	const hrs: Hour[] = Array.from({ length: 48 }, (_, i) => ({ time: `${String(i % 24).padStart(2, '0')}:00`, temp: 80 + (i % 5), kind: 'night-clear' }));
	hrs[13] = { time: '13:00', temp: 80, kind: 'thunder', rain: 70 };
	hrs[14] = { time: '14:00', temp: 83, kind: 'rain', rain: 40 };

	it('leaves hours that fit alone', () => {
		expect(bucketHours(hrs.slice(0, 5), 6)).toEqual(hrs.slice(0, 5));
	});

	it('folds hours into at most `fit` buckets, keeping the worst sky and the wettest chance', () => {
		const six = bucketHours(hrs, 6);
		expect(six).toHaveLength(6);
		expect(six[1]).toEqual({ time: '08:00', temp: hrs[8].temp, kind: 'thunder', rain: 70 });
		expect(six[0].rain).toBeUndefined();
		expect(bucketHours(hrs, 12)).toHaveLength(12);
		expect(bucketHours(hrs, 0)).toHaveLength(1);
	});
});

describe('weather-forecast: behaviour', () => {
	it('toggles C to F and back, converting now and the days', async () => {
		const { container } = render(WeatherForecast, { props: { place: 'Lisbon', now: { temp: 20, condition: 'sunny' }, days } });
		expect(container.querySelector('[data-slot="now-temp"]')?.textContent).toBe('20°');
		await fireEvent.click(screen.getByRole('button', { name: '°F' }));
		expect(container.querySelector('[data-slot="now-temp"]')?.textContent).toBe('68°');
		expect(screen.getByRole('button', { name: /Tue: Light showers, high 64°, low 57°/ })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: '°C' }));
		expect(container.querySelector('[data-slot="now-temp"]')?.textContent).toBe('20°');
	});

	it('keeps bar positions and colours when the unit toggles, and dots a flat day', async () => {
		const { container } = render(WeatherForecast, {
			props: { place: 'Lisbon', now: { temp: 9, condition: 'rain' }, days: [...days, { day: 'Thu', high: 15, low: 15 }] }
		});
		const styles = () => [...container.querySelectorAll('.wf-track')].map((e) => e.getAttribute('style'));
		const before = styles();
		expect(before[0]).toContain('--p0');
		expect(container.querySelector('.wf-now')?.getAttribute('style')).toMatch(/--at:\s*0%/);
		expect(container.querySelectorAll('.wf-track')[3].getAttribute('data-dot')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: '°F' }));
		expect(styles()).toEqual(before);
	});

	it('reads Today on row 1 even without now, and drops the rain caption row when dry', () => {
		const { container } = render(WeatherForecast, { props: { place: 'Lisbon', days: [{ day: 'Thu', condition: 'sunny', high: 18, low: 14 }] } });
		expect(container.querySelector('.wf-name')?.textContent).toBe('Today');
		expect(screen.getByRole('button', { name: /^Today, Thu: Sunny/ })).toBeTruthy();
		expect(container.querySelector('.wf-pct')).toBeNull();
	});

	it('shows a picked day details and the icon kind per day', async () => {
		const { container } = render(WeatherForecast, { props: { place: 'Lisbon', days } });
		const kinds = [...container.querySelectorAll('[data-slot="days"] svg')].map((s) => s.getAttribute('data-kind'));
		expect(kinds).toEqual(['partly-cloudy', 'rain', 'cloudy']);
		await fireEvent.click(screen.getByRole('button', { name: /^Today, Mon:/ }));
		const detail = container.querySelector('[data-slot="day-detail"]')!;
		expect(detail.textContent).toContain('07:31');
		expect(detail.textContent).toContain('18:52');
		expect(screen.getByRole('button', { name: /^Today, Mon:/ }).getAttribute('aria-pressed')).toBe('true');
	});

	it('streams with field-less days and hours and ends equal to the whole render', async () => {
		await expectStreamParity({
			ui: {
				type: 'weather-forecast',
				props: {
					place: 'Lisbon',
					note: 'Sample forecast',
					now: { temp: 21, condition: 'partly-cloudy', humidity: 64, wind: '14 km/h' },
					hourly: [{ time: '15:00', temp: 22, condition: 'sunny' }, {}],
					days: [days[0], {}, days[1], { day: 'Thu' }]
				}
			}
		});
	});
});
