// control.ts: the shared field rhythm for form atoms, so controls placed side
// by side agree. Input, select, combobox, date-picker, time-picker and
// number-input stack FIELD (label, 6px gap, control) and size the control box
// with CONTROL_H at md. Every field and inline (switch, checkbox, radio) label
// uses FIELD_LABEL's 1.35 line height, so wrapped labels read the same.

export const FIELD = 'flex min-w-0 flex-col gap-1.5';

export const FIELD_LABEL = 'text-sm font-medium leading-[1.35] text-ripple-surface-foreground';

/** The md control height (36px), shared with input's md shell. */
export const CONTROL_H = 'h-9';
