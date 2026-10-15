// sources.test.ts: the data rules of sources-bar (names, links, count,
// grammar, copy text), fed by the polish pass's worst-case rows.
import { describe, expect, it } from 'vitest';
import { copyText, initialOf, linkable, sourcesModel, summaryName } from './sources.js';

describe('linkable', () => {
	it('keeps absolute http(s) URLs', () => {
		expect(linkable('https://lanternpost.example.com/a')).toBe('https://lanternpost.example.com/a');
		expect(linkable('http://thirdstreet.example.org/r')).toBe('http://thirdstreet.example.org/r');
	});
	it('prefixes https:// on a schemeless host path', () => {
		expect(linkable('harborledger.example.org/markets/today')).toBe('https://harborledger.example.org/markets/today');
	});
	it('refuses scripts, other schemes, relative paths and junk', () => {
		for (const v of ['javascript:alert(1)', 'mailto:a@example.com', '/markets/today', 'markets', '', '   ', 42, null, {}, 'a b.example.com'])
			expect(linkable(v)).toBeUndefined();
	});
});

describe('initialOf', () => {
	it('takes the first readable grapheme', () => {
		expect(initialOf('lanternpost')).toBe('L');
		expect(initialOf('3rd Street Review')).toBe('3');
		expect(initialOf('"Quoted" Weekly')).toBe('Q');
		expect(initialOf('(Paren) Daily')).toBe('P');
		expect(initialOf('東湾経済新聞')).toBe('東');
		expect(initialOf('📈 Market Pulse')).toBe('📈');
	});
});

describe('sourcesModel', () => {
	it('normalises the messy rows of spec 05', () => {
		const m = sourcesModel(
			[
				{ name: 'Lanternpost', url: 'https://lanternpost.example.com/a' },
				{ name: 42, url: 'https://fortytwo.example.org' },
				{ name: { text: 'Harbor Ledger' } },
				{ name: '' },
				{ name: '   ' },
				null,
				'Fieldnote Review',
				{ url: 'https://nameless.example.net/x' },
				{ name: 'Quarry Weekly', url: '', favicon: '', color: '' }
			],
			'12',
			''
		);
		expect(m.items.map((s) => s.name)).toEqual(['Lanternpost', '42', 'Fieldnote Review', 'nameless.example.net', 'Quarry Weekly']);
		expect(m.items[4]).toMatchObject({ href: undefined, favicon: undefined, color: undefined });
		expect(m.displayCount).toBe(12);
		expect(m.label).toBe('sources');
		expect(m.unlisted).toBe(7);
		expect(copyText(m.items)).not.toMatch(/undefined|\[object/);
	});

	it('keeps duplicates, links schemeless and shows a URL-as-name as its host', () => {
		const m = sourcesModel([
			{ name: 'Harbor Ledger' },
			{ name: 'Harbor Ledger', url: 'harborledger.example.org/markets/today' },
			{ name: 'Ironvale Briefing', url: 'javascript:alert(1)' },
			{ name: 'https://www.notes.example.net/2026/a-slug', url: 'https://www.notes.example.net/2026/a-slug' }
		]);
		expect(m.items.length).toBe(4);
		expect(m.items[0].href).toBeUndefined();
		expect(m.items[1].href).toBe('https://harborledger.example.org/markets/today');
		expect(m.items[1].host).toBe('harborledger.example.org');
		expect(m.items[2].href).toBeUndefined();
		expect(m.items[3]).toMatchObject({ name: 'notes.example.net', host: 'notes.example.net', title: 'https://www.notes.example.net/2026/a-slug' });
	});

	it('gets grammar and count rules right', () => {
		expect(sourcesModel([{ name: 'A' }]).label).toBe('source');
		expect(sourcesModel([{ name: 'A' }, { name: 'B' }], 1).displayCount).toBe(2);
		expect(sourcesModel([{ name: 'A' }], -3).displayCount).toBe(1);
		expect(sourcesModel([{ name: 'A' }], 'lots').displayCount).toBe(1);
		expect(sourcesModel([{ name: 'A' }], 4.7).displayCount).toBe(4);
		const big = sourcesModel(Array.from({ length: 5 }, (_, i) => ({ name: `S${i}` })), 48, 'pages read');
		expect([big.displayCount, big.label, big.unlisted]).toEqual([48, 'pages read', 43]);
	});

	it('handles empty, count-only and non-array input', () => {
		expect(sourcesModel([])).toMatchObject({ displayCount: 0, countOnly: false });
		expect(sourcesModel('nope')).toMatchObject({ displayCount: 0, items: [] });
		expect(sourcesModel([], 12)).toMatchObject({ displayCount: 12, countOnly: true, label: 'sources' });
	});

	it('drops a colour that could break out of its declaration', () => {
		const m = sourcesModel([{ name: 'A', color: 'red; position: fixed' }, { name: 'B', color: 'not-a-color' }, { name: 'C', color: '#1877F2' }]);
		expect(m.items[0].color).toBeUndefined();
		expect(m.items[2].color).toBe('#1877F2');
	});
});

describe('summaryName and copyText', () => {
	it('names the first three and counts the rest', () => {
		const m = sourcesModel(Array.from({ length: 12 }, (_, i) => ({ name: `S${i + 1}` })));
		expect(summaryName(m)).toBe('12 sources: S1, S2, S3 and 9 more');
		expect(summaryName(sourcesModel([{ name: 'Only' }]))).toBe('1 source: Only');
	});
	it('writes one numbered line per source, no em dash', () => {
		const m = sourcesModel([{ name: 'Lanternpost', url: 'https://lanternpost.example.com/a' }, { name: 'Harbor Ledger' }]);
		expect(copyText(m.items)).toBe('1. Lanternpost, https://lanternpost.example.com/a\n2. Harbor Ledger');
	});
});
