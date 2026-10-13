// @file build/index.ts
// @description The `@ripple-ui/core/build` subpath: the build loop a node host
//   (the skill's build.mjs, the pocketpaw worker) runs to craft a spec in
//   rounds. Kept off the root entry so chat bundles never carry it.

export {
	buildSpec,
	parseSpecText,
	type Box,
	type BuildLimits,
	type BuildOptions,
	type BuildResult,
	type Critic,
	type CriticIssue,
	type Model,
	type ModelRequest,
	type Preset,
	type RenderResult,
	type Renderer,
	type Round,
	type StopReason
} from './build-spec.js';
export type { AuditItem, AuditReport } from '../core/audit-report.js';
