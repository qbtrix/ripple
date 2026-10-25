// scripts/widget-sources.ts: maps every widget type in the eager registry
// (src/lib/widgets/index.ts) to the .svelte file that defines it, by reading
// the registry and the barrels it imports. @ripple-ui/embed builds its lazy,
// one-chunk-per-widget loader map from this at build time, so adding a widget
// to the registry is all it takes; nothing generated is committed.
// widget-sources.test.ts proves the map matches the live registry exactly
// (same types, and each file's default export is the registered component).
// The parser expects the registry's current shape: named imports from
// `./<dir>/index.js` barrels of `export { default as X } from './X.svelte'`,
// default imports of `.svelte` files, and one `type: Component,` per line.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g;
const DEFAULT_IMPORT = /import\s+([A-Za-z_$][\w$]*)\s+from\s*'(\.[^']+\.svelte)'/g;
const BARREL_DEFAULT = /export\s*\{\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*'(\.[^']+\.svelte)'/g;
const ENTRY = /^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*([A-Za-z_$][\w$]*)\s*,?\s*(?:\/\/.*)?$/;

/** `{ type: absolute .svelte path }` for every entry of the default registry. */
export function widgetSources(widgetsDir: string): Record<string, string> {
	const indexPath = resolve(widgetsDir, 'index.ts');
	const index = readFileSync(indexPath, 'utf8');
	const files = new Map<string, string>(); // local component name -> file

	for (const [, name, from] of index.matchAll(DEFAULT_IMPORT)) files.set(name, resolve(widgetsDir, from));
	for (const [, names, from] of index.matchAll(NAMED_IMPORT)) {
		if (!from.endsWith('/index.js')) continue;
		const barrelPath = resolve(widgetsDir, from.replace(/\.js$/, '.ts'));
		const barrel = new Map<string, string>();
		for (const [, exported, file] of readFileSync(barrelPath, 'utf8').matchAll(BARREL_DEFAULT)) {
			barrel.set(exported, resolve(dirname(barrelPath), file));
		}
		for (const part of names.split(',')) {
			const [imported, local = imported] = part.trim().split(/\s+as\s+/);
			if (imported && barrel.has(imported)) files.set(local, barrel.get(imported)!);
		}
	}

	const block = index.match(/const defaultRegistry: WidgetMap = \{([\s\S]*?)\n\};/);
	if (!block) throw new Error(`widget-sources: no defaultRegistry block in ${indexPath}`);
	const out: Record<string, string> = {};
	for (const line of block[1].split('\n')) {
		if (!line.trim() || line.trim().startsWith('//')) continue;
		const m = line.match(ENTRY);
		if (!m) throw new Error(`widget-sources: cannot parse registry line: ${line.trim()}`);
		const [, quoted, bare, component] = m;
		const file = files.get(component);
		if (!file) throw new Error(`widget-sources: no .svelte file found for ${component}`);
		out[quoted ?? bare] = file;
	}
	return out;
}
