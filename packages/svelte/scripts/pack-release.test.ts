// scripts/pack-release.test.ts
// Guards the npm publish shape built by the repo-root scripts/pack-release.mjs:
// the rewrite applied to the real package.json files leaves no dependency an
// outside install cannot resolve, and the tarball check catches a file: dep,
// a leftover `source` condition and a missing export target. The script runs
// the same check on every real tarball it packs; this keeps it honest in CI.

import { describe, expect, it } from 'vitest';
import corePkg from '../../core/package.json' with { type: 'json' };
import sveltePkg from '../package.json' with { type: 'json' };
import embedPkg from '../../embed/package.json' with { type: 'json' };
import reactPkg from '../../react/package.json' with { type: 'json' };
import { publishProblems, publishShape, REQUIRED } from '../../../scripts/pack-release.mjs';

type Pkg = { name: string; exports?: unknown; dependencies?: Record<string, string> };

/** Every file a tarball would need for `pkg` to pass: its export targets plus the required extras. */
function filesFor(pkg: Pkg): string[] {
	const out: string[] = [];
	const walk = (e: unknown) => {
		if (typeof e === 'string') out.push(e.replace(/^\.\//, ''));
		else if (e && typeof e === 'object') Object.values(e).forEach(walk);
	};
	walk(pkg.exports);
	return [...out, ...(REQUIRED as Record<string, string[]>)[pkg.name]];
}

describe('npm publish shape', () => {
	const shaped = publishShape({ core: corePkg, svelte: sveltePkg, embed: embedPkg, react: reactPkg });

	it('pins svelte to the core version instead of file:../core', () => {
		expect(sveltePkg.dependencies['@ripple-ui/core']).toBe('file:../core');
		expect(shaped.svelte.dependencies?.['@ripple-ui/core']).toBe(`^${corePkg.version}`);
	});

	it('pins react to the embed version, and leaves no file: link even in devDependencies', () => {
		expect(shaped.react.dependencies?.['@ripple-ui/embed']).toBe(`^${embedPkg.version}`);
		for (const pkg of Object.values(shaped)) {
			expect(JSON.stringify(pkg)).not.toContain('"file:');
		}
	});

	it('ships the embed with no runtime dependencies, so consumers install no Svelte', () => {
		expect(shaped.embed).not.toHaveProperty('dependencies');
		expect(shaped.embed).not.toHaveProperty('peerDependencies');
	});

	it('leaves every shaped manifest with nothing the tarball check rejects', () => {
		for (const pkg of Object.values(shaped)) expect(publishProblems(pkg, filesFor(pkg))).toEqual([]);
	});

	it('rejects a file: dependency, a source condition and a missing export target', () => {
		const files = filesFor(shaped.core);
		expect(publishProblems({ ...shaped.svelte, dependencies: { x: 'file:../x' } }, filesFor(shaped.svelte))).toEqual([
			'dependencies.x is "file:../x", which no outside install can resolve'
		]);
		expect(publishProblems(corePkg, filesFor(corePkg)).join('\n')).toContain('"source" condition');
		expect(publishProblems(shaped.core, files.filter((f) => f !== 'dist/index.js'))).toContain(
			'export target ./dist/index.js is not in the tarball'
		);
	});
});
