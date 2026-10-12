// widgets/composite/WeatherForecast.test.ts: the weather-forecast widget:
// registry and aliases, condition words to icon kinds (unknown is cloudy),
// the unit toggle converting every number, picking a day for its details,
// range bars on the week's shared scale, and streamed parity with field-less days.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { expectStreamParity } from '$lib/streaming/__fixtures__/stream-parity.js';
import { getWidget } from '../index.js';
import WeatherForecast from './WeatherForecast.svelte';
import { at, convert, outlook, readDays, span, toKind } from './weather-forecast.js';

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

	it('shows a picked day details and the icon kind per day', async () => {
		const { container } = render(WeatherForecast, { props: { place: 'Lisbon', days } });
		const kinds = [...container.querySelectorAll('[data-slot="days"] svg')].map((s) => s.getAttribute('data-kind'));
		expect(kinds).toEqual(['partly-cloudy', 'rain', 'cloudy']);
		await fireEvent.click(screen.getByRole('button', { name: /^Mon:/ }));
		const detail = container.querySelector('[data-slot="day-detail"]')!;
		expect(detail.textContent).toContain('07:31');
		expect(detail.textContent).toContain('18:52');
		expect(screen.getByRole('button', { name: /^Mon:/ }).getAttribute('aria-pressed')).toBe('true');
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
