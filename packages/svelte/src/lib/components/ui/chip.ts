// chip.ts: the one "selected option" look shared by tabs-list and segmented.
// The track is a --ripple-track wash on the --ripple-radius scale; the
// selected option is a raised chip (--ripple-raised fill, control-border rim,
// soft shadow) whose radius sits 2px inside the track's, so the two nest.
// --ripple-raised is lighter than the track in both themes (see theme.css).

export const CHIP_TRACK = 'rounded-ripple bg-ripple-track p-0.5';

export const CHIP_RADIUS = 'rounded-[calc(var(--ripple-radius)-2px)]';

export const SELECTED_CHIP = 'bg-ripple-raised text-ripple-surface-foreground shadow-sm ring-1 ring-ripple-control-border';

/** SELECTED_CHIP for a bits-ui trigger that marks itself data-state=active. */
export const ACTIVE_CHIP =
	'data-[state=active]:bg-ripple-raised data-[state=active]:text-ripple-surface-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-ripple-control-border';
