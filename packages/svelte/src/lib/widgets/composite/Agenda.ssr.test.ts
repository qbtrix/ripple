// widgets/composite/Agenda.ssr.test.ts: agenda renders through svelte/server:
// computed start times, totals, owners, done state and the run button.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Agenda from './Agenda.svelte';

describe('agenda SSR', () => {
	it('renders the timed agenda on the server', () => {
		const { body } = render(Agenda, {
			props: {
				title: 'Weekly sync',
				start: '09:30',
				items: [
					{ title: 'Wins', owner: 'Maya Chen', minutes: 5, done: true },
					{ title: 'Metrics', minutes: 10 }
				]
			}
		});
		expect(body).toContain('Weekly sync');
		expect(body).toContain('09:30 to 09:45 · 15 min · 1 of 2 done');
		expect(body).toContain('09:35');
		expect(body).toContain('aria-label="Wins, done"');
		expect(body).toContain('Maya Chen');
		expect(body).toContain('Start meeting');
	});
});
