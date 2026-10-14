// widgets/composite/StandupBoard.ssr.test.ts: standup-board renders through
// svelte/server: title, date, the derived verdict, the open count, blocked
// people first with their blocker and a Resolve control.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import StandupBoard from './StandupBoard.svelte';

describe('standup-board SSR', () => {
	it('renders the standup on the server', () => {
		const { body } = render(StandupBoard, {
			props: {
				team: 'Payments team',
				date: '2026-10-14',
				people: [
					{ name: 'Aarav Mehta', today: 'Add pagination' },
					{ name: 'Lina Okafor', role: 'DevOps', today: 'Run the migration', blocker: 'Waiting on staging DB creds.' }
				]
			}
		});
		expect(body).toContain('Payments team');
		expect(body).toContain('Wed 14 Oct');
		expect(body).toContain('Lina is blocked on staging DB creds.');
		expect(body).toContain('open blocker');
		expect(body.indexOf('Lina Okafor')).toBeLessThan(body.indexOf('Aarav Mehta'));
		expect(body).toContain('Resolve Lina Okafor');
	});
});
