// e2e/landing-chat-scroll.spec.ts
// @file e2e/landing-chat-scroll.spec.ts
// @description Real-browser checks for the landing chat's scrolling, the part
//   jsdom cannot see (layout, wheel routing, the visual viewport). Three rules:
//     1. A wheel over a card's spec peek scrolls the conversation, so the
//        reader never gets stuck in a small inner pane.
//     2. Opening every suggestion leaves the conversation its height: the
//        open panel sits over the log instead of squeezing it.
//     3. When an on-screen keyboard shrinks the visual viewport (iOS, which
//        does not resize the layout viewport), the composer stays above it;
//        Android Chrome is told to resize the content (interactive-widget).

import { expect, test, type Page } from '@playwright/test';

const scroller = (page: Page) => page.locator('.scroller').first();
const scrollTop = (page: Page) => scroller(page).evaluate((el) => el.scrollTop);

test('a wheel over a card spec peek scrolls the conversation, not the peek', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/', { waitUntil: 'networkidle' });
	// Its spec is taller than the peek, so the peek can scroll on its own.
	await page.locator('.chip', { hasText: 'Spanish flashcards' }).first().click();
	// The card has finished once the log is no longer busy.
	await expect(page.locator('[role="log"]')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
	const peek = page.locator('.peek:not([inert]) pre').last();
	await expect(peek).toBeVisible();

	const before = await scrollTop(page);
	expect(before).toBeGreaterThan(200); // the log followed the new card down
	const box = (await peek.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120));
	await page.mouse.wheel(0, -400);
	await expect.poll(() => scrollTop(page)).toBeLessThan(before - 100);
});

test('opening every suggestion does not squeeze the conversation', async ({ page }) => {
	for (const size of [
		{ width: 1280, height: 800 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(size);
		await page.goto('/', { waitUntil: 'networkidle' });
		const height = () => scroller(page).evaluate((el) => el.clientHeight);
		const closed = await height();
		await page.getByRole('button', { name: 'Show all suggestions' }).click();
		await expect(page.locator('button[aria-controls="ripple-suggestions"]')).toHaveAttribute('aria-expanded', 'true');
		expect(await height(), `${size.width}px`).toBeGreaterThanOrEqual(closed - 4);
	}
});

test('an on-screen keyboard never covers the composer', async ({ page }) => {
	// iOS keeps the layout viewport and shrinks only the visual viewport, so a
	// 100dvh chat puts the composer under the keyboard. Simulate that.
	await page.addInitScript(() => {
		const vv = new EventTarget() as EventTarget & { height: number; width: number; offsetTop: number; offsetLeft: number; scale: number };
		vv.height = window.innerHeight;
		vv.width = window.innerWidth;
		vv.offsetTop = 0;
		vv.offsetLeft = 0;
		vv.scale = 1;
		Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
		(window as unknown as { __keyboard: (h: number) => void }).__keyboard = (h) => {
			vv.height = h;
			vv.dispatchEvent(new Event('resize'));
		};
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/', { waitUntil: 'networkidle' });

	const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(meta).toContain('interactive-widget=resizes-content');

	await page.locator('textarea').first().focus();
	await page.evaluate(() => (window as unknown as { __keyboard: (h: number) => void }).__keyboard(500));
	await expect
		.poll(async () => (await page.locator('textarea').first().boundingBox())!.y + (await page.locator('textarea').first().boundingBox())!.height)
		.toBeLessThanOrEqual(500);
});
