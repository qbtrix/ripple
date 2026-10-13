// figures/frame.ts: fits a figure's viewBox to what it actually draws. A
// figure's camera is fitted to a few hand-picked points, which can miss a part,
// a blurred shadow, a pin or the far end of a motion; here the SVG strings of
// several moments are scanned (every path point and dot) and the box around all
// of them, plus the pins and a margin, becomes the viewBox. Pins are then placed
// in percent of that box, so the Figure widget can stretch the SVG to any card
// width and every part and pin stays inside. Pure strings and numbers.

export interface FrameBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

const POINT = /[ML]\s*(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g;
const DOT = /cx="(-?\d*\.?\d+)"\s+cy="(-?\d*\.?\d+)"/g;

/** Every path point and dot centre in an SVG string (the kit writes absolute M/L paths). */
export function pointsOf(svg: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (const [, d] of svg.matchAll(/\sd="([^"]*)"/g)) for (const [, x, y] of d!.matchAll(POINT)) out.push([Number(x), Number(y)]);
	for (const [, x, y] of svg.matchAll(DOT)) out.push([Number(x), Number(y)]);
	return out;
}

/** The box round every point of every frame and every pin (pins count `pin` units each way), plus `pad`. */
export function frameOf(svgs: string[], pins: Array<[number, number]> = [], pad = 10, pin = 12): FrameBox {
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
	const take = (x: number, y: number, r = 0) => {
		x0 = Math.min(x0, x - r);
		y0 = Math.min(y0, y - r);
		x1 = Math.max(x1, x + r);
		y1 = Math.max(y1, y + r);
	};
	for (const svg of svgs) for (const [x, y] of pointsOf(svg)) take(x, y);
	for (const [x, y] of pins) take(x, y, pin);
	const r = (v: number) => Math.round(v * 10) / 10;
	return { x: r(x0 - pad), y: r(y0 - pad), w: r(x1 - x0 + pad * 2), h: r(y1 - y0 + pad * 2) };
}

export const framed = (svg: string, f: FrameBox) => svg.replace(/viewBox="[^"]*"/, `viewBox="${f.x} ${f.y} ${f.w} ${f.h}"`);

/** A point in figure units as percent of the frame, one decimal. */
export const percentIn = (f: FrameBox, [x, y]: [number, number]) => ({ x: Math.round(((x - f.x) / f.w) * 1000) / 10, y: Math.round(((y - f.y) / f.h) * 1000) / 10 });
