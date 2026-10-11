// Types for the built-in 3D model library: a catalog of open-licence GLB files,
// each with named anchors (label points) measured once against the shipped file.
export interface ModelAnchor {
  name: string;
  label: string;
  position: string;
  normal?: string;
  orbit?: string;
}
export interface ModelAsset {
  id: string;
  title: string;
  file: string;
  poster?: string;
  orbit?: string;
  license: "CC0-1.0" | "CC-BY-4.0";
  author: string;
  source: string;
  tags: string[];
  anchors: ModelAnchor[];
}
export type ModelCatalog = Record<string, ModelAsset>;
