// page-audit.test.ts: pageAudit's DOM-only checks on planted faults, under
// jsdom. jsdom has no layout, so element rects are stubbed from a `data-rect`
// attribute; overflow and clipped text need real layout and are covered in a
// browser by skills/ripple/scripts/render.test.mjs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pageAudit, type PageCheck } from './page-audit.js';

function mount(html: string) {
	document.body.innerHTML = `<div class="surface" data-rect="0,0,400,600"><div class="ripple-root" data-rect="0,0,400,600">${html}</div></div>`;
	return document.querySelector('.surface')!;
}

beforeEach(() => {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const [x, y, w, h] = (this.getAttribute('data-rect') ?? '0,0,0,0').split(',').map(Number);
		return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} };
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const each = (counts: Record<PageCheck, number>, boxes: { check: PageCheck }[]) => {
	for (const [check, n] of Object.entries(counts)) expect(boxes.filter((b) => b.check === check).length).toBe(n);
};

describe('pageAudit', () => {
	it('a clean card counts zero everywhere', () => {
		const res = pageAudit(mount('<p data-rect="10,10,200,20" style="opacity:1">Total 42</p>'));
		expect(Object.values(res.counts).every((n) => n === 0)).toBe(true);
		expect(res.boxes).toEqual([]);
		expect([res.width, res.height]).toEqual([400, 600]);
	});

	it('finds an error box with the node id and its place', () => {
		const res = pageAudit(mount('<div role="alert" data-ripple-node-error="n3" data-rect="20,40,300,50">boom</div>'));
		expect(res.counts.errorBoxes).toBe(1);
		expect(res.items.errorBoxes).toEqual(['div: boom']);
		expect(res.boxes).toEqual([{ check: 'errorBoxes', node: 'n3', x: 20, y: 40, w: 300, h: 50 }]);
	});

	it('finds leaked values and raw JSON in visible text', () => {
		const res = pageAudit(
			mount(
				'<div data-ripple-node="t1" data-widget="text" data-rect="0,0,200,20" style="opacity:1">Total NaN</div>' +
					'<pre data-rect="0,30,200,20" style="opacity:1">{"a": 1}</pre>'
			)
		);
		expect(res.items.badText).toEqual(['widget=text node=t1 div "Total NaN"', 'pre raw JSON "{"a": 1}"']);
		expect(res.boxes.filter((b) => b.check === 'badText')[0]).toMatchObject({ node: 't1', w: 200, h: 20 });
		each(res.counts, res.boxes);
	});

	it('finds an empty container, outermost only', () => {
		const res = pageAudit(
			mount('<div class="slot a" data-rect="0,0,300,120" style="opacity:1"><div data-rect="0,0,280,100" style="opacity:1"></div></div>')
		);
		expect(res.items.emptyContainers).toEqual(['div.slot.a 300x120']);
		each(res.counts, res.boxes);
	});

	it('scopes errors to the root unless asked for document-wide alerts', () => {
		const surface = mount('');
		document.body.insertAdjacentHTML('beforeend', '<div class="pane"><div class="alert">bad spec</div></div>');
		expect(pageAudit(surface).counts.errorBoxes).toBe(0);
		expect(pageAudit(surface, { documentErrors: '.pane .alert' }).items.errorBoxes).toEqual(['div.alert: bad spec']);
	});
});
