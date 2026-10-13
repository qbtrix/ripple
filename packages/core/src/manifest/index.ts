/**
 * @file manifest/index.ts
 * @description Public entry for `@ripple-ui/core/manifest`: the LLM-facing
 * documents that describe the engine rather than any widget. The action
 * grammar and the spec envelope (shared with `@ripple-ui/svelte`'s full
 * manifest), and the slim manifest for `@ripple-ui/core/headless/slim`.
 *
 * Craft data (craft.ts): the audit check ids, the reviewed waivers, the
 * props that carry the user's data, the critic's lenses, the craft rules and
 * the intent map, shared by the build loop, the manifest build and the hosts.
 *
 * Also the `illustration` widget's SVG allowlist (illustration-svg.ts), which
 * the pocketpaw validator and the landing card policy mirror.
 *
 * Pure data and small builders: no zod, no Svelte, no DOM.
 */

export { manifestActions, type ActionSpec } from './actions.js';
export { specEnvelope, type SpecEnvelope } from './envelope.js';
export {
	buildSlimManifest,
	slimActions,
	type SlimManifest,
	type SlimManifestOptions,
	type SlimWidgetEntry,
	type SlimWidgetField
} from './slim.js';
export { BASE_ACTIONS, type BaseAction } from '../core/base-dispatcher.js';
export { SLIM_WIDGETS } from './slim-widgets.js';
export {
	CHECK_IDS,
	DATA_PROPS,
	waivers,
	lenses,
	rules,
	craft,
	intents,
	type Waiver,
	type Lens,
	type CraftRule,
	type Intent
} from './craft.js';
export {
	ILLUSTRATION_ELEMENTS,
	ILLUSTRATION_ATTRIBUTES,
	ILLUSTRATION_ANIMATION_ELEMENTS,
	ILLUSTRATION_ANIMATION_ATTRIBUTES,
	ILLUSTRATION_ANIMATABLE,
	ILLUSTRATION_HREF_ELEMENTS,
	ILLUSTRATION_TRANSFORM_TYPES,
	ILLUSTRATION_HOSTILE_ELEMENTS,
	ILLUSTRATION_DANGER_TOKENS,
	ILLUSTRATION_ENTITIES,
	ILLUSTRATION_CAPS,
	ILLUSTRATION_MAX_HEIGHT,
	ILLUSTRATION_ANNOTATION_CAPS
} from './illustration-svg.js';
