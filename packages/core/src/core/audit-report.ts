// @file core/audit-report.ts
// @description The one result shape every Ripple audit returns: iso figure
//   checks, the spec audit (`specAudit`), and later the page audit and the
//   critic. A check reports `{ check, count, items }`; a count of 0 is a pass,
//   and a part the check could not measure is an item, never a silent pass.
//   Thresholds are the check's options with defaults, not fields here.
//   `warnings` and `waived` sit beside `items` and never count.
//   Types only: this file must stay zod-free and import nothing at runtime, so
//   `./headless/slim` and `./manifest` can reach it without pulling `/schema/`
//   (headless/slim.imports.test.ts guards that).

/** One check's result over one input. */
export interface AuditReport<T> {
	/** The check's name, e.g. `schema`, `catalog`, `supports`. */
	check: string;
	/** How many items failed; 0 is a pass. Equals `items.length`. */
	count: number;
	items: T[];
	/** Items a host waived on purpose, kept out of `count`. */
	waived?: T[];
	/** Items worth a look that do not fail the check (an unknown prop), kept out of `count`. */
	warnings?: T[];
}

/** One fault in a spec, located and worded for the model that wrote it. */
export interface AuditItem {
	/** Stable kind, e.g. `schema`, `unknownWidget`. */
	code: string;
	/** JSON Pointer from the spec root (RFC 6901), e.g. `/ui/children/2/props`; `''` is the whole spec. */
	path: string;
	/** What is wrong, in a sentence the model can act on. */
	message: string;
	/** The widget type the fault sits in, when a renderer measured it (render tier); waivers match on it before `path`. */
	widget?: string;
}
