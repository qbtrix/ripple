// widgets/data/map-labels.ts: which side of its pin a map label chip sits on.
// Pure pixel geometry, so Map.svelte only measures and paints. A chip tries
// below, right, left, above (in that order of preference) and takes the side
// that keeps it inside the frame, off the Leaflet controls and other chips,
// and off the drawn routes. Any clipping or covering loses to crossing a
// route; ties keep the earlier side.

export type Side = 'below' | 'right' | 'left' | 'above';
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
/** A route segment in container pixels: x1, y1, x2, y2. */
export type Seg = [number, number, number, number];

const ORDER: readonly Side[] = ['below', 'right', 'left', 'above'];

/** The chip's box for a side, `gap` px from the pin centre (px, py). */
export function labelRect(side: Side, px: number, py: number, w: number, h: number, gap: number): Rect {
	if (side === 'below') return { x: px - w / 2, y: py + gap, w, h };
	if (side === 'above') return { x: px - w / 2, y: py - gap - h, w, h };
	if (side === 'right') return { x: px + gap, y: py - h / 2, w, h };
	return { x: px - gap - w, y: py - h / 2, w, h };
}

function overlap(a: Rect, b: Rect): number {
	const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	return w > 0 && h > 0 ? w * h : 0;
}

/** Does the segment pass through the rectangle (Liang-Barsky clip). */
export function crosses([x1, y1, x2, y2]: Seg, r: Rect): boolean {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const p = [-dx, dx, -dy, dy];
	const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
	let t0 = 0;
	let t1 = 1;
	for (let i = 0; i < 4; i++) {
		if (p[i] === 0) {
			if (q[i] < 0) return false;
			continue;
		}
		const t = q[i] / p[i];
		if (p[i] < 0) {
			if (t > t1) return false;
			if (t > t0) t0 = t;
		} else {
			if (t < t0) return false;
			if (t < t1) t1 = t;
		}
	}
	return true;
}

/** The best side for a w x h chip on the pin at (px, py) in a frame of fw x fh. */
export function pickSide(
	px: number,
	py: number,
	w: number,
	h: number,
	gap: number,
	frame: { w: number; h: number },
	blocked: readonly Rect[],
	segs: readonly Seg[]
): Side {
	const box: Rect = { x: 0, y: 0, w: frame.w, h: frame.h };
	let best: Side = 'below';
	let bestScore = Infinity;
	for (const side of ORDER) {
		const r = labelRect(side, px, py, w, h, gap);
		// Any clipped or covered pixel costs a whole chip, so it always loses
		// to crossing a route (half a chip); more of it costs more.
		const cost = (px2: number) => (px2 > 0 ? w * h + 4 * px2 : 0);
		let score = cost(w * h - overlap(r, box));
		for (const b of blocked) score += cost(overlap(r, b));
		if (segs.some((s) => crosses(s, r))) score += (w * h) / 2;
		if (score < bestScore) {
			best = side;
			bestScore = score;
		}
	}
	return best;
}
