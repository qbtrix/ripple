// widgets/data/Kanban.ssr.test.ts: kanban renders through svelte/server with
// the move menu wired, so the prerendered showcase never touches window,
// document or CSS at import or render time.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Kanban from './Kanban.svelte';

describe('kanban SSR', () => {
	it('renders lanes, counts, Other and move buttons on the server', () => {
		const { body } = render(Kanban, {
			props: {
				columns: [
					{ id: 'todo', title: 'To do', color: '#ff0000' },
					{ id: 'done', title: 'Done', color: 'green' }
				],
				value: [
					{ id: 1, title: 'Plan the picnic', status: 'todo' },
					{ id: 2, title: 'Book the hall', status: 'later' }
				],
				onchange: () => {}
			}
		});
		expect(body).toContain('To do, 1 card');
		expect(body).toContain('Done, 0 cards');
		expect(body).toContain('Other, 1 card');
		expect(body).toContain('Move Plan the picnic');
		expect(body).toContain('color-mix(in oklab, #ff0000 75%, var(--ripple-surface))');
	});
});
