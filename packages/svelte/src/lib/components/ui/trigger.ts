// trigger.ts: the one "this is pressable" treatment for overlay triggers.
// A string trigger on tooltip and hover-card renders as an inline text button
// (accent text, dotted underline); on popover it renders as a ghost button
// with a trailing chevron. A spec-node trigger renders as given. Used by the
// overlay widgets so a reader can point at every trigger without hovering.

export const TEXT_TRIGGER =
	'inline-flex items-center gap-1 cursor-pointer rounded-sm text-ripple-accent-text underline decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring';

export const GHOST_TRIGGER =
	'inline-flex h-8 items-center gap-1 cursor-pointer rounded-ripple px-2.5 text-sm font-medium text-ripple-surface-foreground transition-colors hover:bg-ripple-track focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ripple-ring data-[state=open]:bg-ripple-track';
