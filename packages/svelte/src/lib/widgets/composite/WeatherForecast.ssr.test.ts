// widgets/composite/WeatherForecast.ssr.test.ts: weather-forecast renders
// through svelte/server: the now block, the day buttons with their spoken
// labels, the outlook line, and icons that animate only through CSS classes.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import WeatherForecast from './WeatherForecast.svelte';

describe('weather-forecast SSR', () => {
	it('renders the forecast on the server', () => {
		const { body } = render(WeatherForecast, {
			props: {
				place: 'Lisbon',
				note: 'Sample forecast',
				now: { temp: 21, condition: 'partly-cloudy', feelsLike: 20 },
				days: [
					{ day: 'Mon', condition: 'sunny', high: 23, low: 16 },
					{ day: 'Tue', condition: 'rain', high: 18, low: 14, rainChance: 80 }
				]
			}
		});
		expect(body).toContain('Lisbon');
		expect(body).toContain('Sample forecast');
		expect(body).toContain('21°');
		expect(body).toContain('aria-label="Tue: Rain, high 18°, low 14°, 80% chance of rain"');
		expect(body).toContain('Rain likely on Tue.');
		expect(body).toContain('wx-live');
		expect(body).not.toContain('<animate');
	});
});
