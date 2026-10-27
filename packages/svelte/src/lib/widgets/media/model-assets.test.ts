// Guards the model library: every catalog entry points at a real, in-budget file
// with a usable licence and well-formed, unique anchors, and every mesh in it
// carries a material (a bare primitive renders as glTF's flat white metal).
import { describe, expect, it } from 'vitest';
import { MODEL_ASSETS } from './model-assets.js';

// Tests run from the package root. ripple's tsconfig carries no node types.
// @ts-ignore
const { existsSync, readFileSync, readdirSync, statSync } = await import('node:fs');
const dir = 'static/models/';
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_BUDGET = 600 * 1024;
const TOTAL_BUDGET = 10 * 1024 * 1024;
const assets = Object.entries(MODEL_ASSETS);
const vec3 = (s: string) => s.trim().split(/\s+/).map(Number);

/** The glTF JSON chunk of a .glb file. */
function glbJson(file: string): { meshes?: { primitives: { material?: number }[] }[] } {
	const buf: Uint8Array = readFileSync(file);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const length = view.getUint32(12, true);
	return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + length)));
}

describe('MODEL_ASSETS', () => {
	it('has a real library', () =>
		expect(assets.length).toBeGreaterThanOrEqual(20));

	it.each(assets)('%s is well formed', (key, a) => {
		expect(a.id).toBe(key);
		expect(a.id).toMatch(KEBAB);
		expect(existsSync(dir + a.file)).toBe(true);
		expect(statSync(dir + a.file).size).toBeLessThanOrEqual(FILE_BUDGET);
		if (a.poster) expect(existsSync(dir + a.poster)).toBe(true);
		expect(['CC0-1.0', 'CC-BY-4.0', 'public-domain']).toContain(a.license);
		expect(a.author.trim()).not.toBe('');
		expect(a.source).toMatch(/^https:\/\//);
		expect(a.anchors.length).toBeGreaterThanOrEqual(3);
		const names = a.anchors.map((n) => n.name);
		expect(new Set(names).size).toBe(names.length);
		for (const n of a.anchors) {
			expect(n.name).toMatch(KEBAB);
			expect(n.label.trim()).not.toBe('');
			for (const v of [n.position, n.normal ?? '0 1 0']) {
				const xyz = vec3(v);
				expect(xyz).toHaveLength(3);
				expect(xyz.every(Number.isFinite)).toBe(true);
			}
		}
	});

	it.each(assets)('%s gives every mesh primitive a material', (_key, a) => {
		const bare = (glbJson(dir + a.file).meshes ?? []).flatMap((m) => m.primitives).filter((p) => p.material == null);
		expect(bare).toHaveLength(0);
	});

	it('ids are unique and every shipped GLB is in the catalog', () => {
		const files = readdirSync(dir).filter((f: string) => f.endsWith('.glb'));
		expect(files.sort()).toEqual(assets.map(([, a]) => a.file).sort());
	});

	it('stays within the total budget', () => {
		const total = readdirSync(dir).reduce(
			(s: number, f: string) => s + statSync(dir + f).size,
			0,
		);
		expect(total).toBeLessThanOrEqual(TOTAL_BUDGET);
	});
});
