// e2e/widget-narrow.spec.ts: the layout half of the phone-width widget fixes,
// in real Chromium (jsdom has no layout and no container queries). Each case
// renders a spec through /playground?s= inside a fixed-width column, 288 to
// 360px (phone chat cards) and 640 to 720px (desktop), and asserts on rects:
// nothing cut, nothing past the widget's edge, the intended column count.
// Colour cases run in both themes and read contrast through a canvas, so
// oklch() and color-mix() computed values compare as sRGB.
// The logic half (events, currency, verdict, align) is small-width.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test.use({ viewport: { width: 1600, height: 1100 } });

type Spec = { state?: Record<string, unknown>; ui: Record<string, unknown> };

const fixture = (name: string): Spec => {
	const rec = JSON.parse(readFileSync(fileURLToPath(new URL(`../src/routes/live/fixtures/${name}.json`, import.meta.url)), 'utf8'));
	return JSON.parse(rec.chunks.map((c: { text: string }) => c.text).join(''));
};

async function open(page: Page, spec: Spec, width: number, theme: 'light' | 'dark' = 'light') {
	await page.addInitScript((t) => localStorage.setItem('ripple-theme', t), theme);
	const wrapped = {
		version: '1.0',
		state: spec.state ?? {},
		ui: { type: 'flex', props: { direction: 'column', style: { width: `${width}px` } }, children: [spec.ui] }
	};
	await page.goto(`/playground?s=${Buffer.from(JSON.stringify(wrapped)).toString('base64url')}`);
	await page.waitForFunction(() => [...document.querySelectorAll('.ripple-root *')].some((e) => e.getBoundingClientRect().height > 8));
}

/** Every match must sit inside the widget box (1px slack) and show its text whole. */
async function allInsideAndWhole(page: Page, widget: string, selector: string) {
	return page.evaluate(
		([w, sel]) => {
			const root = document.querySelector(`[data-widget="${w}"]`)!.getBoundingClientRect();
			return [...document.querySelectorAll<HTMLElement>(`[data-widget="${w}"] ${sel}`)].flatMap((el) => {
				const b = el.getBoundingClientRect();
				const out: string[] = [];
				if (!b.width || el.closest('.sr-only, [hidden]')) return out;
				if (b.right > root.right + 1 || b.left < root.left - 1) out.push(`${sel} "${el.textContent?.trim()}" spans ${b.left - root.left}..${b.right - root.left} of ${root.width}`);
				const cut = el instanceof HTMLInputElement ? el.scrollWidth > el.clientWidth + 1 : el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible';
				if (cut) out.push(`${sel} "${el.textContent?.trim() || (el as HTMLInputElement).value}" is cut (${el.scrollWidth} > ${el.clientWidth})`);
				return out;
			});
		},
		[widget, selector]
	);
}

const tops = (page: Page, selector: string) =>
	page.locator(selector).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
const lefts = (page: Page, selector: string) =>
	page.locator(selector).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));

const TIERS = [
	{ id: 'starter', name: 'Starter', price: 0, period: 'month', features: ['3 notebooks', 'Sync on 2 devices'], cta: 'Start free' },
	{ id: 'team', name: 'Team', price: 8, period: 'user/month', features: ['Unlimited notebooks', 'Shared notebooks'], cta: 'Try Team free', popular: true },
	{ id: 'business', name: 'Business', price: 15, period: 'user/month', features: ['SSO and audit log', 'Priority support'], cta: 'Contact sales' }
];

test.describe('pricing-table', () => {
	const spec: Spec = {
		state: { picked: '' },
		ui: {
			type: 'flex',
			props: { direction: 'column' },
			children: [
				{ type: 'pricing-table', props: { currency: 'EUR', tiers: TIERS }, on_select: { action: 'set', target: 'picked', value: '{event.id}' } },
				{ type: 'text', props: { text: 'picked:{state.picked}' } }
			]
		}
	};
	const cards = '[data-widget="pricing-table"] > div';

	test('one column at 360, every tier in one row at 720', async ({ page }) => {
		await open(page, spec, 360);
		expect(new Set(await lefts(page, cards)).size).toBe(1);
		expect(await allInsideAndWhole(page, 'pricing-table', ':is(span, button)')).toEqual([]);
		await open(page, spec, 720);
		expect(new Set(await tops(page, cards)).size).toBe(1);
		expect(await page.locator('[data-widget="pricing-table"]').textContent()).toContain('€8');
	});

	test('a CTA fires the spec on_select', async ({ page }) => {
		await open(page, spec, 360);
		await page.getByRole('button', { name: 'Try Team free' }).click();
		await expect(page.getByText('picked:team')).toBeVisible();
	});
});

test.describe('habit-tracker', () => {
	const spec: Spec = {
		ui: {
			type: 'habit-tracker',
			props: {
				title: 'This week',
				habits: [
					{ id: 'water', name: 'Drink water', icon: 'water', target_per_week: 7 },
					{ id: 'read', name: 'Read 20 minutes', icon: 'read', target_per_week: 7 },
					{ id: 'run', name: 'Exercise', icon: 'run', target_per_week: 5 }
				]
			}
		}
	};
	// 320 is a 380px phone's chat card; 640 sits between the old root-measured
	// breakpoint and the panel's real room.
	for (const width of [320, 360, 640, 720]) {
		test(`names read whole and nothing pokes out at ${width}`, async ({ page }) => {
			await open(page, spec, width);
			expect(await allInsideAndWhole(page, 'habit-tracker', '[data-slot="name"], [data-slot="days"], [data-slot="progress"]')).toEqual([]);
			const nameWidth = await page.locator('[data-habit="read"] [data-slot="name"]').evaluate((e) => e.getBoundingClientRect().width);
			expect(nameWidth).toBeGreaterThan(60);
		});
	}
});

test.describe('weather-forecast', () => {
	const ui = (days: number) => ({
		type: 'weather-forecast',
		props: {
			place: 'Lisbon',
			now: { temp: 21, condition: 'partly-cloudy' },
			days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].slice(0, days).map((d, i) => ({ day: d, condition: 'sunny', high: 24 + i, low: 16, rainChance: 100 }))
		}
	});
	for (const width of [320, 360]) {
		test(`the day row keeps its high inside the card at ${width}`, async ({ page }) => {
			await open(page, { ui: ui(5) }, width);
			expect(await allInsideAndWhole(page, 'weather-forecast', ':is(.wf-hi, .wf-lo, .wf-pct)')).toEqual([]);
		});
	}
	test('one day at 720 is a row, not a lone column; five days stand side by side', async ({ page }) => {
		await open(page, { ui: ui(1) }, 720);
		const one = await page.locator('.wf-day').evaluate((e) => e.getBoundingClientRect());
		expect(one.width).toBeGreaterThan(500);
		expect(one.height).toBeLessThan(80);
		await open(page, { ui: ui(5) }, 720);
		expect(new Set(await tops(page, '.wf-day')).size).toBe(1);
	});
});

test.describe('exec-dashboard', () => {
	const spec: Spec = {
		ui: {
			type: 'exec-dashboard',
			props: {
				title: 'Running',
				kpis: [
					{ id: 'd', label: 'Total distance', value: 133.5, unit: 'km', sparkline: [3, 5, 4, 6] },
					{ id: 'p', label: 'Average pace', value: '5:40', unit: '/km' },
					{ id: 'l', label: 'Longest run', value: 18.2, unit: 'km' }
				],
				table: {
					columns: [
						{ key: 'date', label: 'Date' },
						{ key: 'km', label: 'Distance', align: 'right' }
					],
					rows: [{ date: '1 Oct', km: '6.2 km' }]
				}
			}
		}
	};
	test('two KPI tiles a row at 360, and the table honours align', async ({ page }) => {
		await open(page, spec, 360);
		const t = await tops(page, '.rdash-kpi');
		expect(t[0]).toBe(t[1]);
		expect(t[2]).toBeGreaterThan(t[0]);
		expect(await allInsideAndWhole(page, 'exec-dashboard', '.rdash-kpi')).toEqual([]);
		const align = await page.locator('[data-widget="exec-dashboard"] td').nth(1).evaluate((e) => getComputedStyle(e).textAlign);
		expect(align).toBe('right');
	});
});

/** Text over its effective background, as a WCAG ratio, both read through a canvas. */
async function contrast(page: Page, selector: string) {
	return page.locator(selector).evaluateAll((els) => {
		const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')!;
		const rgb = (c: string) => {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, 1, 1);
			ctx.fillStyle = c;
			ctx.fillRect(0, 0, 1, 1);
			return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
		};
		const lum = (c: number[]) => {
			const [r, g, b] = c.map((v) => {
				const s = v / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const paint = (c: string) => {
			ctx.fillStyle = c;
			ctx.fillRect(0, 0, 1, 1);
		};
		const alpha = (c: string) => {
			ctx.clearRect(0, 0, 1, 1);
			paint(c);
			return ctx.getImageData(0, 0, 1, 1).data[3];
		};
		/** The colour behind `el`: its translucent backgrounds composited down to the first opaque one. */
		const bgOf = (el: Element | null): number[] => {
			const layers: string[] = [];
			for (; el; el = el.parentElement) {
				const b = getComputedStyle(el).backgroundColor;
				if (!alpha(b)) continue;
				layers.push(b);
				if (alpha(b) === 255) break;
			}
			ctx.clearRect(0, 0, 1, 1);
			paint('#fff');
			for (const c of layers.reverse()) paint(c);
			return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
		};
		return els.map((el) => {
			const a = lum(rgb(getComputedStyle(el).color));
			const bg = bgOf(el);
			const b = lum(bg);
			return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 + ` ${el.textContent?.trim()} ${getComputedStyle(el).color} on rgb(${bg.join(",")})`;
		});
	});
}

test.describe('bill-split', () => {
	const spec: Spec = {
		ui: {
			type: 'bill-split',
			props: {
				currency: 'EUR',
				subtotal: 186,
				tip_percent: 15,
				tip_options: [0, 10, 15],
				people: [{ name: 'Lena' }, { name: 'Marco' }, { name: 'Anneliese-Marguerite' }, { name: 'Tomás' }]
			}
		}
	};
	test('a 20-character name fits its input at 360', async ({ page }) => {
		await open(page, spec, 360);
		expect(await allInsideAndWhole(page, 'bill-split', '[data-person] input[type="text"]')).toEqual([]);
	});
	for (const theme of ['light', 'dark'] as const) {
		test(`summary chips meet AA contrast in ${theme}`, async ({ page }) => {
			await open(page, spec, 360, theme);
			const ratios = await contrast(page, '[data-slot="totals"] span');
			expect(ratios.length).toBeGreaterThan(0);
			for (const r of ratios) expect(parseFloat(r), r).toBeGreaterThanOrEqual(4.5);
			// The tile's own edge, so it does not melt into a card of nearly the same tone.
			const edge = await page.locator('[data-slot="totals"] > div').first().evaluate((e) => getComputedStyle(e).boxShadow);
			expect(edge).not.toBe('none');
		});
	}
});

test.describe('gallery fixtures on a phone card', () => {
	// 288 is the widget's own width inside a 380px phone's padded chat card.
	for (const width of [288, 360]) {
		test(`itinerary day titles wrap instead of cutting at ${width}`, async ({ page }) => {
			await open(page, fixture('tokyo-trip'), width);
			expect(await allInsideAndWhole(page, 'itinerary', 'button[aria-expanded] .text-body-emph')).toEqual([]);
		});
	}
	test('a tool-call argument chip is never cut short at 288', async ({ page }) => {
		await open(page, fixture('refund-approval'), 288);
		const cut = await page.locator('.ripple-tool-call .truncate').evaluateAll((els) =>
			els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)
		);
		expect(cut).toEqual([]);
	});
	for (const theme of ['light', 'dark'] as const) {
		test(`model-viewer pins stay inside and the stage is toned in ${theme}`, async ({ page }) => {
			await open(page, fixture('plane-3d'), 320, theme);
			await page.waitForSelector('[data-slot="pin-label"]');
			await page.waitForTimeout(1500); // the model loads and the labels place
			const stage = await page.locator('model-viewer').evaluate((e) => getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor);
			expect(stage).not.toBe('nonergba(0, 0, 0, 0)');
			const out = await page.evaluate(() => {
				const box = document.querySelector('model-viewer')!.getBoundingClientRect();
				return [...document.querySelectorAll('[data-slot="pin-label"]')]
					.map((l) => l.getBoundingClientRect())
					.filter((b) => b.width && (b.right > box.right + 1 || b.left < box.left - 1)).length;
			});
			expect(out).toBe(0);
		});
	}
});

test.describe('heatmap', () => {
	const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	// A sparse year of deploys: 53 weeks x 7 days, one outlier, deterministic.
	const calendar: Spec = {
		ui: {
			type: 'heatmap',
			props: {
				title: 'Deploys per day',
				yLabels: DAYS,
				height: 160,
				cells: Array.from({ length: 53 * 7 }, (_, k) => ({ x: `W${Math.floor(k / 7) + 1}`, y: DAYS[k % 7], value: k === 282 ? 4800 : (k * 37) % 5 === 0 ? (k % 9) + 1 : 0 }))
			}
		}
	};
	const queues = ['Customer onboarding and account verification desk', 'Billing', 'Returns, exchanges and warranty claims (international)'];
	const months = ['September 2026', 'October 2026', 'November 2026', 'December 2026', 'January 2027', 'February 2027'];
	const long: Spec = {
		ui: { type: 'heatmap', props: { title: 'Median response time', cells: queues.flatMap((y, r) => months.map((x, c) => ({ x, y, value: (r * 7 + c * 13) % 90 }))) } }
	};

	test('y labels sit on their own row when rows are shorter than a label line, at 360', async ({ page }) => {
		await open(page, calendar, 360);
		const rows = await page.evaluate(() => {
			const mid = (e: Element) => {
				const b = e.getBoundingClientRect();
				return (b.top + b.bottom) / 2;
			};
			return [...document.querySelectorAll<HTMLElement>('.hm-y')].map((l) => {
				const r = Number(l.style.gridRow) - 2;
				const cell = [...document.querySelectorAll<HTMLElement>('.hm-cell')].find((c) => c.dataset.r === String(r))!;
				return { text: l.textContent.trim(), off: Math.abs(mid(l) - mid(cell)), rowH: cell.getBoundingClientRect().height };
			});
		});
		expect(rows.map((r) => r.text)).toEqual(['Mon', 'Thu', 'Sun']);
		expect(rows[0].rowH).toBeLessThan(13);
		for (const r of rows) expect(r.off, r.text).toBeLessThan(1);
	});

	test('the readout stays one line, resting and hovered, at 360', async ({ page }) => {
		await open(page, long, 360);
		const height = () => page.locator('.hm-readout').evaluate((e) => e.getBoundingClientRect().height);
		const rest = await height();
		expect(rest).toBeLessThanOrEqual(16);
		await page.locator('.hm-cell[data-r="2"][data-c="5"]').hover();
		expect(await page.locator('.hm-readout').textContent()).toContain('February 2027');
		expect(await height()).toBe(rest);
		await page.locator('.hm-cell[data-r="1"][data-c="0"]').hover();
		expect(await height()).toBe(rest);
	});

	test('x labels show at every Nth column, last group included, inside the card and whole, at 360', async ({ page }) => {
		await open(page, long, 360);
		const cols = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hm-x')].map((e) => Number(e.style.gridColumn) - 2));
		expect(cols[0]).toBe(0);
		const n = cols[1];
		expect(cols).toEqual(months.map((_, i) => i).filter((i) => i % n === 0));
		const bad = await page.evaluate(() => {
			const box = document.querySelector('.hm')!.getBoundingClientRect();
			return [...document.querySelectorAll<HTMLElement>('.hm-xt')]
				.filter((e) => e.getBoundingClientRect().right > box.right + 1 || e.getBoundingClientRect().left < box.left - 1 || e.scrollWidth > e.clientWidth + 1)
				.map((e) => e.textContent);
		});
		expect(bad).toEqual([]);
	});
});
