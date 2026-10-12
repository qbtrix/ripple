// figures/types.ts: the contract every curated figure module meets, so the
// `figure` widget can render any of them: meta for the frame, sliders,
// readouts and pins, and `mount` that draws the figure live into an element.

export interface FigureParam {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	unit?: string;
	value: number;
}

export interface FigureReadout {
	key: string;
	label: string;
	unit?: string;
}

export interface FigureAnchor {
	id: string;
	label: string;
	/** Position in percent of the figure box (0..100). */
	x: number;
	y: number;
}

export interface FigureMeta {
	id: string;
	title: string;
	params: FigureParam[];
	readouts: FigureReadout[];
	anchors: FigureAnchor[];
}

export type FigureTheme = 'dark' | 'light';

export interface FigureHandle {
	update(params: Record<string, number>): void;
	setTheme(theme: FigureTheme): void;
	seek(t: number): void;
	destroy(): void;
}

export interface FigureModule {
	meta: FigureMeta;
	mount(el: HTMLElement, options: { theme?: FigureTheme; params?: Record<string, number>; onReadout?: (values: Record<string, string>) => void }): FigureHandle;
}
