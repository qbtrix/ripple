// widgets/composite/Notes.ssr.test.ts: notes renders through svelte/server
// (the showcase is prerendered): seeded notes, pinned first, their tag chips
// and the filter row are in the markup, and note text is escaped, never HTML.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Notes from './Notes.svelte';

describe('notes SSR', () => {
	it('renders seeded notes, pinned first, with tags and filters on the server', () => {
		const { body } = render(Notes, {
			props: {
				title: 'Ideas',
				tags: ['todo'],
				notes: [
					{ id: 'a', title: 'Plain one', text: '<b>bold?</b>', tags: ['idea'] },
					{ id: 'b', title: 'Pinned one', text: 'Top', pinned: true, color: 'yellow' }
				]
			}
		});
		expect(body).toContain('Ideas');
		expect(body.indexOf('Pinned one')).toBeLessThan(body.indexOf('Plain one'));
		expect(body).toContain('&lt;b>bold?&lt;/b>');
		expect(body).not.toContain('<b>bold?</b>');
		expect(body).toContain('#idea');
		expect(body).toContain('aria-label="Filter by tag"');
		expect(body).toContain('Write a note…');
		expect(body).not.toContain('just now');
	});

	it('renders the empty pad open and ready', () => {
		const { body } = render(Notes, { props: {} });
		expect(body).toContain('A blank page.');
		expect(body).toContain('data-open');
	});
});
