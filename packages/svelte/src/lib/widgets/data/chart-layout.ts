// chart-layout.ts: the pure decisions behind Chart.svelte's echarts option,
// kept free of the DOM so they are unit tested directly (chart-layout.test.ts).
// Palette order, which colour each point or series wears, how the category
// axis fits its labels to the measured width, and the pie/donut legend text
// and layout. Chart.svelte resolves `var(--x)` colours and the theme, then
// feeds these the numbers.

/**
 * Categorical palette in draw order. Brand blue first, then hues that read as
 * categories. Status colours (red, green) are not in it and amber sits late, so
 * a second series (a target, a comparison) never reads as an error or a win.
 * A spec that wants status colours passes them in `colors`.
 */
export const CATEGORICAL = ['#3b82f6', '#14b8a6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#f97316', '#64748b'];

/** The i-th series colour: the spec's `colors[i]`, else the palette in order. */
export function seriesColor(i: number, colors: readonly string[]): string {
	return colors[i] || CATEGORICAL[i % CATEGORICAL.length];
}

/**
 * Colours for the points of ONE series (bar, line, heatmap, gauge, radar).
 * One series is one colour. Points differ only when the spec says so: a point's
 * own `color`, or a `colors` list longer than one (read as per point).
 */
export function pointColors(data: readonly { color?: unknown }[], colors: readonly string[]): string[] {
	return data.map((d, i) => {
		if (typeof d.color === 'string' && d.color) return d.color;
		if (colors.length > 1) return colors[i % colors.length];
		return seriesColor(0, colors);
	});
}

/** Slice colours for pie and donut: every slice is its own category. */
export function sliceColors(data: readonly { color?: unknown }[], colors: readonly string[]): string[] {
	return data.map((d, i) => (typeof d.color === 'string' && d.color ? d.color : seriesColor(i, colors)));
}

export interface AxisLabelFit {
	/** echarts `axisLabel.interval`: 0 shows all, a function picks which. */
	interval: number | ((index: number) => boolean);
	rotate: number;
	/** Set when labels are long enough to shorten once rotated. */
	formatter?: (value: string) => string;
}

const CHAR_W = 0.62; // average glyph width per px of font size
const MAX_ROTATED_CHARS = 16;

/**
 * How a category axis shows `labels` across `plotWidth` px. In order of
 * preference: every label flat, every label rotated (30 then 45 degrees),
 * then rotated and thinned to evenly spaced labels that always keep the first
 * and the last. Never echarts' silent auto-drop. `null` when the width is not
 * known yet (echarts' own default applies until the first measure). `measure`
 * is the label's rendered width in px; the default estimates from its length.
 */
export function fitAxisLabels(
	labels: readonly string[],
	plotWidth: number,
	fontSize = 10,
	measure: (text: string) => number = (t) => t.length * fontSize * CHAR_W
): AxisLabelFit | null {
	const n = labels.length;
	if (n === 0 || !(plotWidth > 0)) return null;
	const longest = Math.max(...labels.map((l) => String(l ?? '').length));
	const widest = Math.max(...labels.map((l) => measure(String(l ?? ''))));
	const band = plotWidth / n;
	if (widest + 6 <= band) return { interval: 0, rotate: 0 };

	// Rotated labels sit on parallel baselines: they clear each other when the
	// perpendicular gap between them, band * sin(angle), is one line tall.
	const line = fontSize + 4;
	const formatter =
		longest > MAX_ROTATED_CHARS
			? (v: string) => (v.length > MAX_ROTATED_CHARS ? `${v.slice(0, MAX_ROTATED_CHARS - 1)}…` : v)
			: undefined;
	for (const rotate of [30, 45]) {
		if (band * Math.sin((rotate * Math.PI) / 180) >= line) return { interval: 0, rotate, formatter };
	}
	const step = Math.ceil(line / Math.sin(Math.PI / 4) / band);
	const last = n - 1;
	return {
		interval: (i: number) => i === last || (i % step === 0 && last - i >= step),
		rotate: 45,
		formatter
	};
}

/** Decimal places in a number as written (3 -> 0, 4.85 -> 2), capped at 2. */
function decimals(v: number): number {
	if (!Number.isFinite(v)) return 0;
	const s = String(v);
	const dot = s.indexOf('.');
	return dot < 0 ? 0 : Math.min(2, s.length - dot - 1);
}

/**
 * Legend line per slice: "Label  value · pct%". Values share the data's own
 * precision (4.8, 5.1, 3 print as 4.8, 5.1, 3.0) so the column reads evenly.
 */
export function sliceLegendText(points: readonly { label: string; value?: number }[]): Map<string, string> {
	const values = points.map((p) => (typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0));
	const total = values.reduce((a, b) => a + Math.max(0, b), 0);
	const d = Math.max(0, ...values.map(decimals));
	const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
	const out = new Map<string, string>();
	points.forEach((p, i) => {
		const v = values[i];
		const pct = total > 0 ? (Math.max(0, v) / total) * 100 : 0;
		const pctText = pct > 0 && pct < 1 ? '<1' : String(Math.round(pct));
		out.set(p.label, `${p.label}  ${fmt(v)} · ${pctText}%`);
	});
	return out;
}

export interface PieLayout {
	center: [string, string];
	radius: number; // outer radius, px
	legend: 'right' | 'bottom';
	/** px the chart grows by to hold a legend below the pie. */
	extraHeight: number;
	/** Legend text width cap (px) when a line is wider than the chart: it wraps. */
	textWidth?: number;
}

/**
 * Where the pie and its legend go in a `width` x `height` box. The legend sits
 * to the right while the pie keeps a useful size beside it; otherwise (phone
 * width) it moves below and the chart grows by the legend's height, so the pie
 * keeps its size and no legend line is cut.
 */
export function pieLayout(width: number, height: number, legendTexts: readonly string[], fontSize = 11): PieLayout {
	const legendW = Math.max(0, ...legendTexts.map((t) => t.length)) * fontSize * CHAR_W + 24;
	const side = width - legendW;
	if (!(width > 0) || side >= Math.min(160, height)) {
		const box = width > 0 ? side : height;
		const r = Math.max(24, (Math.min(box, height) / 2) * 0.8);
		return { center: [width > 0 ? `${Math.round(side / 2)}px` : '40%', '50%'], radius: Math.round(r), legend: 'right', extraHeight: 0 };
	}
	const r = Math.max(24, (Math.min(width, height) / 2) * 0.8);
	// A line wider than the chart wraps inside it; count the wrapped lines.
	const textWidth = Math.max(40, width - 24);
	const lines = legendTexts.reduce((n, t) => n + Math.max(1, Math.ceil((t.length * fontSize * CHAR_W) / textWidth)), 0);
	return {
		center: ['50%', `${Math.round(height / 2)}px`],
		radius: Math.round(r),
		legend: 'bottom',
		extraHeight: lines * (fontSize + 6) + legendTexts.length * 4 + 8,
		textWidth: legendW > width ? textWidth : undefined
	};
}
