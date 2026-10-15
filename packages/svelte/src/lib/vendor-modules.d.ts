// src/lib/vendor-modules.d.ts
// Ambient declarations for third-party packages that ship no TypeScript types.
// Qr.svelte `await import`s `qrcode-svg` at runtime; under `strict`/`noImplicitAny`
// svelte-check flags the untyped module, and there is no @types package, so it
// is declared here as `any`. `d3-sankey` has no @types package in the tree;
// sankey-layout.ts uses only its layout (`sankey`, `sankeyLeft`) and the node
// and link fields declared below.

declare module 'qrcode-svg';

declare module 'd3-sankey' {
	export interface SankeyNode {
		index: number;
		depth: number;
		value: number;
		x0: number;
		x1: number;
		y0: number;
		y1: number;
	}
	export interface SankeyLink {
		source: SankeyNode;
		target: SankeyNode;
		value: number;
		index: number;
		y0: number;
		y1: number;
		width: number;
	}
	export interface SankeyLayout {
		(graph: { nodes: object[]; links: { source: number; target: number; value: number }[] }): {
			nodes: SankeyNode[];
			links: SankeyLink[];
		};
		nodeAlign(f: (node: SankeyNode, n: number) => number): SankeyLayout;
		nodeWidth(w: number): SankeyLayout;
		nodePadding(p: number): SankeyLayout;
		extent(e: [[number, number], [number, number]]): SankeyLayout;
	}
	export function sankey(): SankeyLayout;
	export function sankeyLeft(node: SankeyNode, n: number): number;
}
