// @file core/spec-audit.ts
// @description The pure spec audit: the checks a host runs on a UISpec with no
//   DOM, as `AuditReport<AuditItem>` per check. Today two checks, the same two
//   `specIssues` runs: `schema` (the zod UISpec schema) and `catalog` (node
//   types the injected widget catalog does not know). It calls them directly
//   rather than through `specIssues`, which flattens which check found a
//   problem and writes dotted paths; here every path is a JSON Pointer.
//   The shared planted-fault corpus (`__fixtures__/audit-corpus/`, vendored by
//   pocketpaw) pins what each check reports.

import { safeParseUISpec } from '../schema/ui-spec.js';
import type { AuditItem, AuditReport } from './audit-report.js';
import { validateCatalog, type ValidateCatalogOptions } from './validate-catalog.js';

export type SpecAuditOptions = ValidateCatalogOptions;

const escapeToken = (token: PropertyKey) => String(token).replace(/~/g, '~0').replace(/\//g, '~1');

/** `['ui', 'children', 2]` → `/ui/children/2`. */
export function toPointer(segments: readonly PropertyKey[]): string {
	return segments.map((s) => `/${escapeToken(s)}`).join('');
}

/** validateCatalog's `ui.children[2].else_children[0]` → `/ui/children/2/else_children/0`. */
function catalogPointer(path: string): string {
	return toPointer(path.split(/\.|\[(\d+)\]/).filter((s) => s !== undefined && s !== ''));
}

const report = (check: string, items: AuditItem[]): AuditReport<AuditItem> => ({
	check,
	count: items.length,
	items
});

/**
 * Every pure check over `spec`, one report each, in a fixed order
 * (`schema`, `catalog`). All counts 0 means the spec parses and every node is
 * renderable. Pass the catalog as for `validateCatalog`; with no
 * `widgetTypes`, only `if` and `each` count as known.
 */
export function specAudit(spec: unknown, opts: SpecAuditOptions = {}): AuditReport<AuditItem>[] {
	const parsed = safeParseUISpec(spec);
	const schema: AuditItem[] = parsed.success
		? []
		: parsed.error.issues.map((issue) => ({
				code: 'schema',
				path: toPointer(issue.path),
				message: issue.message
			}));

	const catalog: AuditItem[] =
		spec !== null && typeof spec === 'object'
			? validateCatalog(spec as never, opts).map((node) => ({
					code: 'unknownWidget',
					path: catalogPointer(node.path),
					message: `widget type "${node.type}" isn't in the catalog`
				}))
			: [];

	return [report('schema', schema), report('catalog', catalog)];
}
