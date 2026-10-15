// scripts/pack-release.mjs: packs @ripple-ui/core and @ripple-ui/svelte into
// npm-publishable tarballs and checks every tarball before it is trusted.
//
//   node scripts/pack-release.mjs [outDir]     (default outDir: release/)
//
// Run `bun run build` first. The release workflow and a manual publish both go
// through this file, so npm and the GitHub release carry the same bytes.
//
// Invariants:
// - package.json in git stays workspace-shaped. Only for the length of the pack,
//   core loses its `source` export conditions (they point at src/, which is not
//   shipped) and svelte's `@ripple-ui/core: file:../core` becomes `^<core
//   version>`. The original text is written back byte for byte in `finally` and
//   on SIGINT/SIGTERM; consumers linking a ripple checkout rely on `file:`.
// - Lifecycle scripts never run (`--ignore-scripts`), so the result does not
//   depend on the packer's npm config. That is why this script copies
//   THIRD_PARTY_NOTICES.md into core itself instead of trusting core's prepack.
// - A tarball fails the run if its package.json declares a file:, link: or
//   workspace: dependency, keeps a `source` condition, or names an export or
//   required file the tarball does not contain.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'packages/core');
const SVELTE = join(ROOT, 'packages/svelte');

/** Files each tarball must carry beyond its export targets. */
export const REQUIRED = {
	'@ripple-ui/core': ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md'],
	'@ripple-ui/svelte': ['LICENSE', 'NOTICE', 'README.md', 'dist/manifest.json', 'dist/manifest.slim.json']
};

const LOCAL_PROTOCOL = /^(file|link|workspace|portal):/;
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function stripSource(exp) {
	if (exp && typeof exp === 'object') {
		delete exp.source;
		Object.values(exp).forEach(stripSource);
	}
}

/** The publish shape of both manifests. Pure: takes parsed package.json objects, returns new ones. */
export function publishShape(core, svelte) {
	const c = structuredClone(core);
	const s = structuredClone(svelte);
	stripSource(c.exports);
	if (!s.dependencies?.['@ripple-ui/core']) throw new Error('svelte has no @ripple-ui/core dependency');
	s.dependencies['@ripple-ui/core'] = `^${c.version}`;
	return { core: c, svelte: s };
}

function exportTargets(exp, out = []) {
	if (typeof exp === 'string') out.push(exp);
	else if (exp && typeof exp === 'object') Object.values(exp).forEach((v) => exportTargets(v, out));
	return out;
}

/** Problems with a packed manifest, given the tarball's file list (paths without the `package/` prefix). */
export function publishProblems(pkg, files) {
	const problems = [];
	const have = new Set(files);
	for (const field of DEP_FIELDS) {
		for (const [name, range] of Object.entries(pkg[field] ?? {})) {
			if (LOCAL_PROTOCOL.test(range)) problems.push(`${field}.${name} is "${range}", which no outside install can resolve`);
		}
	}
	if (JSON.stringify(pkg.exports ?? {}).includes('"source"')) problems.push('exports keep a "source" condition pointing at unshipped src/');
	for (const target of exportTargets(pkg.exports)) {
		if (!target.includes('*') && !have.has(target.replace(/^\.\//, ''))) problems.push(`export target ${target} is not in the tarball`);
	}
	for (const f of REQUIRED[pkg.name] ?? []) if (!have.has(f)) problems.push(`${f} is not in the tarball`);
	return problems;
}

/** Reads a tarball's package.json and file list, and throws on any publish problem. */
export function verifyTarball(tgz) {
	const pkg = JSON.parse(execFileSync('tar', ['-xOzf', tgz, 'package/package.json'], { encoding: 'utf8' }));
	const files = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
		.split('\n')
		.filter(Boolean)
		.map((f) => f.replace(/^package\//, ''));
	const problems = publishProblems(pkg, files);
	if (problems.length) throw new Error(`${tgz}:\n  - ${problems.join('\n  - ')}`);
	return { pkg, files };
}

function main(outDir) {
	for (const built of [join(CORE, 'dist/index.js'), join(SVELTE, 'dist/manifest.json')]) {
		if (!existsSync(built)) throw new Error(`${built} is missing. Run \`bun run build\` first.`);
	}
	mkdirSync(outDir, { recursive: true });

	const paths = { core: join(CORE, 'package.json'), svelte: join(SVELTE, 'package.json') };
	const original = { core: readFileSync(paths.core, 'utf8'), svelte: readFileSync(paths.svelte, 'utf8') };
	const restore = () => {
		for (const k of ['core', 'svelte']) writeFileSync(paths[k], original[k]);
	};
	const onSignal = (sig) => {
		restore();
		process.exit(sig === 'SIGINT' ? 130 : 143);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);

	const packed = [];
	try {
		const shaped = publishShape(JSON.parse(original.core), JSON.parse(original.svelte));
		writeFileSync(paths.core, JSON.stringify(shaped.core, null, 2) + '\n');
		writeFileSync(paths.svelte, JSON.stringify(shaped.svelte, null, 2) + '\n');
		// Gitignored copy; core's own prepack does the same when scripts are allowed.
		copyFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(CORE, 'THIRD_PARTY_NOTICES.md'));
		for (const dir of [CORE, SVELTE]) {
			const out = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', outDir], {
				cwd: dir,
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024
			});
			packed.push(JSON.parse(out)[0]);
		}
	} finally {
		restore();
		process.removeListener('SIGINT', onSignal);
		process.removeListener('SIGTERM', onSignal);
	}
	for (const k of ['core', 'svelte']) {
		if (readFileSync(paths[k], 'utf8') !== original[k]) throw new Error(`${paths[k]} was not restored`);
	}

	for (const p of packed) {
		const tgz = join(outDir, p.filename);
		verifyTarball(tgz);
		const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
		console.log(`ok  ${p.name}@${p.version}  ${tgz}  ${p.entryCount} files, ${kb(p.size)} packed, ${kb(p.unpackedSize)} unpacked`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main(resolve(process.argv[2] ?? join(ROOT, 'release')));
	} catch (err) {
		console.error(`pack-release: ${err.message}`);
		process.exit(1);
	}
}
