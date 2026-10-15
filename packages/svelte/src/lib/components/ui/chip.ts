// chip.ts: the one "selected option" look shared by tabs-list and segmented.
// The track is a --ripple-track wash on the --ripple-radius scale; the
// selected option is a raised chip (--ripple-raised fill, --ripple-border
// hairline, soft 0 1px 2px shadow) whose radius sits 2px inside the track's, so
// the two nest. The 3:1 boundary comes from the chip-to-track fill contrast,
// not a dark rim, so the chip never reads as a focus ring.
// --ripple-raised is lighter than the track in both themes (see theme.css).

export const CHIP_TRACK = 'rounded-ripple bg-ripple-track p-0.5';

export const CHIP_RADIUS = 'rounded-[calc(var(--ripple-radius)-2px)]';

export const SELECTED_CHIP = 'bg-ripple-raised text-ripple-surface-foreground shadow-[0_1px_2px_rgb(0_0_0/0.1)] ring-1 ring-ripple-border';

/** SELECTED_CHIP for a bits-ui trigger that marks itself data-state=active. */
export const ACTIVE_CHIP =
	'data-[state=active]:bg-ripple-raised data-[state=active]:text-ripple-surface-foreground data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.1)] data-[state=active]:ring-1 data-[state=active]:ring-ripple-border';
