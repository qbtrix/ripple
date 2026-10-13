// figures/index.ts: the FIGURES catalog the `figure` widget picks from by id.
// Each entry carries only its title (so the frame renders on the server) and a
// lazy import of the module that holds the geometry, which loads in the browser.
import type { FigureModule } from './types.js';

export interface FigureEntry {
	title: string;
	load: () => Promise<FigureModule>;
}

export const FIGURES: Record<string, FigureEntry> = {
	heart: { title: 'How a heart pumps', load: () => import('./heart/index.js') },
	'bike-gears': { title: 'How bike gears work', load: () => import('./bike-gears/index.js') },
	tokamak: { title: 'How a fusion reactor works', load: () => import('./tokamak/index.js') }
};

export type { FigureAnchor, FigureHandle, FigureMeta, FigureModule, FigureParam, FigureReadout, FigureTheme } from './types.js';
