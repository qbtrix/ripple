// Sankey.test.ts: the rendered sankey in jsdom (laid out at the SSR width):
// figures and remainders on the card, the summary and readout, accessible
// names on every node, the footnote for messy data, and the empty state.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';
import Sankey from './Sankey.svelte';
import { SPEC01, SPEC04 } from './__fixtures__/sankey-specs.js';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('sankey', () => {
	test('spec 01: summary, figures, remainder and readout without hovering', () => {
		const { container } = render(Sankey, { props: { ...SPEC01, title: 'User Journey' } });
		expect(text(container.querySelector('.sk-summary'))).toBe('120 from Landing · most end at Active (70, 58%)');
		const labels = [...container.querySelectorAll('.sk-label')].map(text);
		expect(labels).toEqual(['Landing 120', 'Signup 120 · 100%', 'Active 85 · 71%', 'Churn 15 · 13%']);
		expect([...container.querySelectorAll('.sk-stop')].map(text)).toEqual(['35 stop here', '70 stop here']);
		expect(text(container.querySelector('.sk-readout'))).toBe('Largest flow: Landing → Signup, 120 (100% of Landing)');
		expect(container.querySelectorAll('.sk-node')).toHaveLength(4);
		expect(container.querySelectorAll('.sk-band')).toHaveLength(3);
		expect(container.querySelector('.sk-note')).toBeNull();
	});

	test('every node is one named tab stop; focus drives the readout and lights its bands', async () => {
		const { container, getByRole } = render(Sankey, { props: SPEC01 });
		const signup = getByRole('button', { name: 'Signup, 120 in, 85 out, 35 stop here' });
		expect(container.querySelectorAll('button')).toHaveLength(4);
		await fireEvent.focus(signup);
		expect(text(container.querySelector('.sk-readout'))).toBe('Signup · 120 in · 85 out · 35 stop here');
		expect(container.querySelectorAll('.sk-band.is-lit')).toHaveLength(2);
		expect(container.querySelectorAll('.sk-band.is-dim')).toHaveLength(1);
		await fireEvent.keyDown(signup, { key: 'Escape' });
		expect(container.querySelectorAll('.sk-band.is-lit')).toHaveLength(0);
		expect(text(container.querySelector('.sr-only ul, ul.sr-only'))).toContain('Landing to Signup, 120');
		expect(text(container.querySelector('ul.sr-only'))).toContain('35 stop at Signup');
	});

	test('spec 04: messy data draws, with a footnote and no NaN or undefined', () => {
		const { container } = render(Sankey, { props: SPEC04 as never });
		expect(text(container.querySelector('.sk-note'))).toBe(
			'7 flows not drawn: 4 without a value, 2 looping back, 1 missing an end · Not linked: Orphan, Promo'
		);
		expect(container.textContent).not.toMatch(/NaN|undefined/);
		expect(container.querySelector('[aria-label^="Paid, 1,100 in, 1,300 out"]')).not.toBeNull();
		expect(container.querySelector('[aria-label^="Wishlist"]')).not.toBeNull();
	});

	test('nothing drawable is a designed empty state', () => {
		const { container } = render(Sankey, { props: { nodes: [{ name: 'Lone' }], links: [] } });
		expect(text(container.querySelector('.sk-empty'))).toBe('No flows to show');
		expect(text(container.querySelector('.sk-note'))).toBe('Not linked: Lone');
	});
});
