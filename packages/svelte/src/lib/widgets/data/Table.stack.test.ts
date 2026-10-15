// widgets/data/Table.stack.test.ts: the internal layout="stack" mode. A
// read-only table also renders a list (one labelled group per row, title,
// trailing value, labelled meta) for widths under 480px; text cells stop
// breaking mid-word; the default layout and interactive tables are unchanged.
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';

afterEach(cleanup);

const columns = [
	{ key: 'name', label: 'Deal' },
	{ key: 'stage', label: 'Stage' },
	{ key: 'value', label: 'Value', align: 'right' as const },
	{ key: 'owner', label: 'Owner' }
];
const rows = [
	{ name: 'Northwind expansion', stage: 'Negotiation', value: '$120k', owner: 'Alex Liu' },
	{ name: 'Harbor renewal', stage: 'Proposal', value: '$48k', owner: '' }
];

test('stack renders a list with one labelled group per row and labelled meta', () => {
	const { container } = render(Table, { props: { columns, rows, layout: 'stack' } });
	const groups = screen.getAllByRole('group');
	expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Northwind expansion', 'Harbor renewal']);
	expect(groups[0].textContent).toContain('$120k');
	const meta = [...container.querySelectorAll('[data-slot="table-stack-meta"]')].map((m) => m.textContent!.replace(/\s+/g, ' ').trim());
	expect(meta[0]).toBe('Stage Negotiation · Owner Alex Liu');
	// empty values drop out of the line
	expect(meta[1]).toBe('Stage Proposal');
	// the table is still there for wide containers; text cells wrap at spaces only
	const td = screen.getAllByText('Negotiation').find((e) => e.tagName === 'TD')!;
	expect(td.className).toContain('[overflow-wrap:break-word]');
	expect(td.className).not.toContain('min-w-[8ch]');
	expect(container.querySelector('[data-slot="table-stack"]')!.className).toContain('@min-[480px]:hidden');
});

test('default layout has no list and keeps its cell classes', () => {
	const { container } = render(Table, { props: { columns, rows } });
	expect(container.querySelector('[data-slot="table-stack"]')).toBeNull();
	const td = screen.getByText('Negotiation').closest('td')!;
	expect(td.className).toContain('[overflow-wrap:anywhere]');
	expect(td.className).toContain('min-w-[8ch]');
});

test('an interactive table ignores stack', () => {
	const { container } = render(Table, { props: { columns, rows, layout: 'stack', searchable: true } });
	expect(container.querySelector('[data-slot="table-stack"]')).toBeNull();
});

test('stack clamps the title, keeps short columns on one line and marks an untitled row', () => {
	const { container } = render(Table, {
		props: { columns, rows: [...rows, { name: '', stage: 'Qualified', value: '$12k', owner: 'Esme Tanaka' }], layout: 'stack' }
	});
	const title = container.querySelector('[data-slot="table-stack"] li span[title]')!;
	expect(title.className).toContain('line-clamp-2');
	expect(title.getAttribute('aria-hidden')).toBe('true');
	expect(screen.getAllByRole('group')[2].getAttribute('aria-label')).toBe('Untitled');
	expect(screen.getAllByText('Untitled').length).toBe(2);
	const td = screen.getAllByText('Negotiation').find((e) => e.tagName === 'TD')!;
	expect(td.className).toContain('whitespace-nowrap');
	const owner = screen.getAllByText('Esme Tanaka').find((e) => e.tagName === 'TD')!;
	expect(owner.className).toContain('whitespace-nowrap');
});

test('stack keeps a bare count in the labelled meta line, not the trailing slot', () => {
	const cols = [
		{ key: 'name', label: 'Candidate' },
		{ key: 'stage', label: 'Stage' },
		{ key: 'days', label: 'Days in stage', align: 'right' as const }
	];
	const { container } = render(Table, { props: { columns: cols, rows: [{ name: 'Noor Haddad', stage: 'Offer', days: 2 }], layout: 'stack' } });
	const meta = container.querySelector('[data-slot="table-stack-meta"]')!.textContent!.replace(/\s+/g, ' ').trim();
	expect(meta).toBe('Stage Offer · Days in stage 2');
});
