// The bike-gears figure measured by the iso audit at three moments (the still
// frame, top gear mid-stroke, mid-shift in the easiest gear): every count is 0
// once the named waivers are taken out, and every waiver still matches a real
// item, so a waiver outlives its fault by one test run at most. Planted faults
// on the real drawing prove the checks see it.
import { describe, expect, test } from 'vitest';
import { auditSvg, boxShape, shapeAttr } from '@ripple-ui/core/iso';
import { auditSvgOf, bikeSvg, review } from './figure.js';

// The audit measures real part shapes and takes about 2 s a frame (more on CI).
describe('bike-gears audit', { timeout: 60_000 }, () => {
	test.each(review.auditFrames())('%s: 0 faults beyond the waivers', (_, svg) => {
		for (const report of auditSvg(svg)) {
			const waived = review.waivers.filter((w) => w.check === report.check).map((w) => w.id);
			expect(report.items.filter((i) => !waived.includes(i.id)), report.check).toEqual([]);
			expect(waived.filter((id) => !report.items.some((i) => i.id === id)), `${report.check}: stale waivers`).toEqual([]);
		}
	});

	test('a planted floating part and a dangling wire are caught on the real drawing', () => {
		const block = `<g data-item="planted"><g class="iso-solid"${shapeAttr(boxShape([0, -10, 300], [10, 0, 310]))}><path class="iso-fill" d="M0 0Z"/></g></g>`;
		const wire = '<g data-item="wire"><path class="iso-line" d="M5 5L25 5"/></g>';
		const [held, loose] = auditSvg(auditSvgOf().replace('</svg>', `${block}${wire}</svg>`));
		expect(held.items.map((i) => i.id)).toContain('planted/0');
		expect(loose.items.map((i) => `${i.id} ${i.end}`)).toEqual(['wire start', 'wire end']);
	});

	test('the audit render leaves the live drawing untouched', () => {
		const before = bikeSvg();
		auditSvgOf();
		expect(bikeSvg()).toBe(before);
		expect(before).not.toContain('data-shape');
	});
});
