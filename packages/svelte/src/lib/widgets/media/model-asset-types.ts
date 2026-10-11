// widgets/media/model-asset-types.ts — the built-in 3D model library contract
// (design doc 2026-10-12-ripple-3d-models.md). A spec names a model by id
// (`asset: "plane"`) and its labelled points by anchor name; it never carries a
// URL or coordinates. The catalog itself lives in model-assets.ts. Files are
// served relative to one asset base the host can move (the landing uses
// `/models/`); the base always ends with `/`.

export interface ModelAnchor {
	/** Kebab id the spec uses: "left-wing". */
	name: string;
	/** Default human label: "Left wing". */
	label: string;
	/** model-viewer data-position, metres: "1.2 0.3 -0.4". */
	position: string;
	/** data-normal, default "0 1 0". */
	normal?: string;
	/** camera-orbit when this anchor is focused: "45deg 60deg 2m". */
	orbit?: string;
}

export interface ModelAsset {
	/** "plane" */
	id: string;
	/** "Small plane" */
	title: string;
	/** Relative to the asset base: "plane.glb". */
	file: string;
	/** Relative: "plane.webp". */
	poster?: string;
	/** Default camera-orbit. */
	orbit?: string;
	license: 'CC0-1.0' | 'CC-BY-4.0';
	author: string;
	/** https page the file came from. */
	source: string;
	tags: string[];
	anchors: ModelAnchor[];
}

export type ModelCatalog = Record<string, ModelAsset>;

const DEFAULT_BASE = 'https://ripple.pocketpaw.xyz/models/';
let base = DEFAULT_BASE;

/** Where catalog files are served from. Empty resets to the default. */
export function setModelAssetBase(url: string): void {
	const u = typeof url === 'string' ? url.trim() : '';
	base = u ? (u.endsWith('/') ? u : `${u}/`) : DEFAULT_BASE;
}

export function getModelAssetBase(): string {
	return base;
}

export interface ResolvedModelAsset {
	asset: ModelAsset;
	src: string;
	poster?: string;
}

/** The catalog entry for `id` with its file URLs, or null when unknown. */
export function resolveModelAsset(id: unknown, catalog: ModelCatalog): ResolvedModelAsset | null {
	if (typeof id !== 'string' || !Object.hasOwn(catalog, id)) return null;
	const asset = catalog[id];
	return { asset, src: base + asset.file, poster: asset.poster ? base + asset.poster : undefined };
}
