// routes/pawbar/card-policy.ts — The landing's client-side check on model-made chat cards.
// A second layer behind the server's card validation (pocketpaw card_spec.py, ripple
// profile), and the only one while a card streams. `refuseCard` walks the whole card,
// ui AND state, and returns a reason to refuse it, or null. CSP is the backstop.
//   1. A card is `{ui, state?}` (plus the `version` the client adds), at most
//      MAX_CARD_NODES widget nodes, each at most MAX_DEPTH deep from its root.
//   2. Actions: local ones (set, toggle, push, remove, open), `emit`, and `flow`,
//      `branch`, `validate`, `toast`, which add no reach. The host acts only on
//      HOST_EVENTS from a final card (session.svelte.ts).
//   3. Widget nodes (the ui root, `children`, any object but a node's `props` whose
//      `type` the renderer resolves) use CHAT_WIDGET_TYPES: the manifest minus
//      embed, ripple-frame, richtext, rich-text, company-header; no aliases.
//   4. URL-ish keys: no `{`, so no expression assembles a URL; else https or
//      relative. The `target` of a PATH_TARGET_ACTIONS action is a state path or
//      event name and takes rule 5 (`navigate` must never join that list).
//   5. Other strings: no javascript:/vbscript:/data: URL, no CSS url(), no markup
//      or markdown image/link, no bare http(s) or www link.
//   6. A handler slot (HANDLER_KEY) never holds a string, so `"{state.x}"` can't
//      run an action kept in state; and `state` holds no action at all.
//   7. `follow-up`'s `props.event` is a FOLLOW_UP_EVENTS name (never `ask`), and
//      its `props` an object.
//   8. A node slot (NODE_SLOTS, and its list) never holds a whole-string
//      expression, and no node's `props` is a string.
//   9. A flow card: its `ui` holds a FLOW_FIELDS key and is step 1. A step is an
//      object of FLOW_STEP_KEYS with a `ui` root node (all rules above, depth from
//      1 per step); `chain` is a step, `chain_map` an object of steps; at most
//      MAX_FLOW_STEPS. `onComplete` only on a step, only `{kind:'chat', message}`
//      with plain text (no `{`) of at most ASK_MAX. `emit` to FLOW_EVENTS only in a
//      flow card.
//  10. `emit ask` (value exactly `{text}`, plain, at most ASK_MAX) and `emit
//      flow.submit` fire only under an ASK_HANDLERS key when that is the outermost
//      handler key; never in state or from a node inside a handler. A comparison's
//      `on_choose` is one: it fires only on a Choose click. No card emits BOOK_CHAT:
//      only the host wires it, after this check.
//  11. An `illustration` node takes no `bind` and one handler only: a node-level
//      `on_select` (fired when a note opens; it may `emit ask` under rule 10). Its `svg`
//      skips rule 5 and is held to the widget contract instead: a string with no `{`
//      anywhere (the engine resolves templates inside strings), no backslash in an
//      attribute value, and passing checkIllustrationSvg; its `annotations` pass
//      checkIllustrationAnnotations against that svg. `title` is non-empty text,
//      `caption` text or null, `max_height` a number in ILLUSTRATION_MAX_HEIGHT. All
//      of it at final: while streaming, only the handler and `bind` rule applies, and
//      no `svg` string is checked (its props may stream before its `type`).
//  12. A game's `on_complete` is no ASK_HANDLERS key: it fires with no click (a quiz
//      countdown can end a run unattended), so it never sends the visitor's turn.
//  13. A `model-viewer` node names a built-in model, never a file: no `src`, `poster`
//      or `environmentImage` prop, and no annotation with a raw `position` or
//      `normal` (both refused while streaming too). At final, `asset` is a
//      MODEL_ASSETS key; `annotations` is a list of at most MODEL_MAX_NOTES
//      `{anchor, label?, note?}` whose `anchor` is one of that asset's anchors, `label`
//      plain text (no `{`) of at most MODEL_LABEL_MAX, `note` of at most MODEL_NOTE_MAX;
//      `focus`, when set, is one of its anchors. Its node-level `on_select` (a click on
//      a label) is an ASK_HANDLERS key under rule 10.
//  14. A `map` node loads only OSM tiles: `tiles` absent or "osm", no `tileUrl` or
//      `tileAttribution` (both refused while streaming too). At most MAP_MAX_PINS
//      markers plus trackers and MAP_MAX_POINTS points across `route`, `paths`,
//      `polygons` and tracker trails (counted while streaming too). At final each
//      marker is an object with no `icon` (the widget has no icon set), a `label`
//      and `popup` of plain text (no `<`, no `{`, at most ASK_MAX), and `actions`
//      absent or only `emit ask` (rule 10 checks its `{text}`).
// Rules 4 and 5 read strings after one pass of HTML character-reference decoding.
// `partial` is for specs still streaming: a prefix of an allowed name is not
// refused yet, flow verbs wait for the flow fields, and shapes are checked at final.
// /live's recorded replays never pass through this.

import { ILLUSTRATION_MAX_HEIGHT } from '@ripple-ui/core/manifest';
import { checkIllustrationAnnotations, checkIllustrationSvg } from '$lib/security/illustration-svg.js';
import { getWidget } from '$lib/widgets/index.js';
import { MODEL_ASSETS } from '$lib/widgets/media/model-assets.js';
import { CHAT_WIDGET_TYPES } from './widget-types.js';

export const ALLOWED_ACTIONS = ['set', 'toggle', 'push', 'remove', 'open', 'emit', 'flow', 'branch', 'validate', 'toast'] as const;
const CARD_KEYS = ['version', 'ui', 'state'];
/** Actions whose `target` the engine reads as a state path, modal id or event name. Never `navigate`. */
export const PATH_TARGET_ACTIONS: readonly string[] = ['set', 'toggle', 'push', 'remove', 'open', 'emit', 'flow', 'branch', 'validate', 'toast'];
/** Host events the landing knows. `ask` sends its `{text}` as the visitor's next message. */
export const HOST_EVENTS: readonly string[] = ['checkout', 'add_to_cart', 'book', 'ask'];
/** The event the host wires onto a booking the store does not back (session.svelte.ts). A card never emits it itself. */
export const BOOK_CHAT = 'book.chat';
/** What a `follow-up` may emit: its own default name or a store event. Never `ask` (the server refuses it too). */
const FOLLOW_UP_EVENTS = ['follow-up', 'checkout', 'add_to_cart', 'book'];
/** A card whose `ui` holds one of these is a flow (core's isFlowSpec reads the same four). */
const FLOW_FIELDS = ['chain', 'chain_map', 'flowId', 'onComplete'];
export const FLOW_STEP_KEYS: readonly string[] = ['version', 'id', 'flowId', 'intent', 'title', 'description', 'ui', 'chain', 'chain_map', 'onComplete', 'form_fields'];
export const FLOW_EVENTS: readonly string[] = ['flow.next', 'flow.back', 'flow.forward', 'flow.submit'];
/** The handler keys an `ask` or `flow.submit` may fire from: a click, a submit, a pick (an illustration's or a model-viewer's label click), a comparison's Choose click, a composite's button list. Never `on_complete` (rule 12). Same set as card_spec.py's ASK_HANDLERS. */
const ASK_HANDLERS = new Set(['on_click', 'on_submit', 'on_select', 'on_choose', 'actions']);
export const ASK_MAX = 500;
export const MAX_FLOW_STEPS = 8;
export const MAX_CARD_NODES = 400;
export const MAX_DEPTH = 16;
export const MODEL_MAX_NOTES = 12;
export const MODEL_LABEL_MAX = 40;
export const MODEL_NOTE_MAX = 280;
/** model-viewer props that load a file: a chat card names a built-in `asset` instead (rule 13). */
const MODEL_FILE_PROPS = ['src', 'poster', 'environmentImage'];
const MODEL_NOTE_KEYS = ['anchor', 'label', 'note'];
export const MAP_MAX_PINS = 30;
export const MAP_MAX_POINTS = 500;
/** map props that would load tiles from a host the model picks (rule 14). */
const MAP_TILE_PROPS = ['tileUrl', 'tileAttribution'];
const ASK_KEYS = ['action', 'target', 'value'];
/** Keys whose value a widget or NodeRenderer hands to the dispatcher. Case-exact, as the widgets read them. */
const HANDLER_KEY = /^on_|^(actions|[a-z]+Actions|learn_more|onRowClick)$/;
const URL_KEY = /(href|url|uri|src|srcset|link|image|img|avatar|icon|favicon|poster|cover|background|action|target)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SCRIPT_URL = /^(javascript|vbscript):/i;
const DATA_URL = /^data:[\w.+-]*\/?[\w.+-]*(;[\w.+=-]+)*,/i;
const STYLE_URL = /url\s*\(/i;
const MARKUP =
	/!\[|<\s*\/?\s*(img|a|iframe|frame|script|object|embed|svg|math|details|link|meta|style|form|base|video|audio|source)\b/i;
/** A tag carrying an event-handler attribute. Bounded so a long run of `<x` stays linear. */
const EVENT_ATTR = /<[a-z][^<>]{0,1000}?[\s/"']on[a-z]+\s*=/i;
const ENTITY = /&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|colon|sol|tab|newline);?/gi;
const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", colon: ':', sol: '/', tab: '\t', newline: '\n' };
const MD_LINK = /\]\(\s*<?\s*([a-z][a-z0-9+.-]*:|\/\/|\\)/i;
const BARE_LINK = /(https?:\/\/|\bwww\.)/i;
const MAX_NODES = 50_000;
/** core's SINGLE_EXPRESSION_REGEX (expression-resolver.ts), the strings resolveString returns raw. Keep identical. */
const WHOLE_EXPRESSION = /^\{([^}]+)\}$/;
/** Props a widget hands to NodeRenderer, by widget type. `x[]` is each element of list `x`, and the list itself. */
const NODE_SLOTS = new Map<string, readonly string[]>(Object.entries({
	'settings-list': ['items[].control'],
	tabs: ['panels[]'],
	split: ['start', 'end'],
	'master-detail': ['detail'],
	kanban: ['cardTemplate'],
	'data-grid': ['columns[].formatter'],
	'tree-table': ['columns[].formatter'],
	'virtual-list': ['item'],
	popover: ['content', 'trigger'],
	'hover-card': ['content', 'trigger'],
	tooltip: ['trigger'],
	'context-menu': ['trigger']
}));

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What a browser reads as the URL: leading controls dropped, tabs/newlines removed, `\` as `/`. */
// eslint-disable-next-line no-control-regex
const asUrl = (v: string) => v.replace(/^[\u0000- ]+/, '').replace(/[\t\n\r]/g, '').replaceAll('\\', '/');

/** One pass of character-reference decoding, as an HTML parser does before it reads tags. */
export function decodeEntities(v: string): string {
	return v.replace(ENTITY, (m, ref: string) => {
		const r = ref.toLowerCase();
		if (!r.startsWith('#')) return NAMED[r] ?? m;
		const n = r[1] === 'x' ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10);
		return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
	});
}

const allowed = (list: readonly string[], name: string, partial: boolean) =>
	list.some((a) => a === name || (partial && a.startsWith(name)));

function urlRefusal(raw: string): string | null {
	if (raw.includes('{')) return 'expression_url';
	const value = decodeEntities(raw);
	if (STYLE_URL.test(value)) return 'style_url';
	const u = asUrl(value);
	if (u.startsWith('//')) return 'unsafe_url';
	if (SCHEME.test(u) && !/^https:/i.test(u)) return 'unsafe_url';
	return null;
}

/** Rule 5 on one string: why it is not plain text, or null. The landing also runs a flow's answers through it. */
export function textRefusal(raw: string): string | null {
	const value = decodeEntities(raw);
	const u = asUrl(value);
	if (SCRIPT_URL.test(u) || DATA_URL.test(u)) return 'unsafe_url';
	if (STYLE_URL.test(value)) return 'style_url';
	if (MARKUP.test(value) || EVENT_ATTR.test(value) || MD_LINK.test(value) || BARE_LINK.test(value)) return 'markup';
	return null;
}

/** Whether a string along `path` in `props` (the list, an element, the slot) is a whole-string expression. */
function slotExpression(props: Record<string, unknown>, path: string): boolean {
	let values: unknown[] = [props];
	for (const seg of path.split('.')) {
		const list = seg.endsWith('[]');
		const key = list ? seg.slice(0, -2) : seg;
		values = values.flatMap((v) => (isRecord(v) ? [v[key]] : []));
		if (list) values = values.flatMap((v) => (Array.isArray(v) ? v : [v]));
		if (values.some((v) => typeof v === 'string' && WHOLE_EXPRESSION.test(v))) return true;
	}
	return false;
}

const typeNames = [...CHAT_WIDGET_TYPES];

/** Whether an `ask` may fire below `key`: null until a handler key, then fixed by the outermost one. */
const askFrom = (ask: boolean | null, key: string) => (ask !== null || !HANDLER_KEY.test(key) ? ask : ASK_HANDLERS.has(key));

const plainText = (v: unknown) => typeof v === 'string' && v.length <= ASK_MAX && !v.includes('{');

function onCompleteRefusal(v: unknown, partial: boolean): string | null {
	if (!isRecord(v)) return 'on_complete';
	if (Object.keys(v).some((k) => !allowed(['kind', 'message'], k, partial))) return 'on_complete';
	if (partial) return (v.kind === undefined || (typeof v.kind === 'string' && allowed(['chat'], v.kind, true))) && (v.message === undefined || plainText(v.message)) ? null : 'on_complete';
	return v.kind === 'chat' && plainText(v.message) ? null : 'on_complete';
}

/** Whether any attribute value in the markup holds a backslash (a CSS escape could spell `url(`). */
function backslashAttr(svg: string): boolean {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	return [...doc.getElementsByTagName('*')].some((el) => [...el.attributes].some((a) => a.value.includes('\\')));
}

/** Rule 11 on an `illustration` node: why it is refused, or null. */
function illustrationRefusal(node: Record<string, unknown>, props: Record<string, unknown>, partial: boolean): string | null {
	const handlers = [...Object.keys(node).filter((k) => k !== 'on_select'), ...Object.keys(props)];
	if ('bind' in node || handlers.some((k) => HANDLER_KEY.test(k))) return 'illustration:handler';
	if (partial) return null;
	const { svg, title, caption, max_height: height } = props;
	if (typeof svg !== 'string') return 'illustration:svg';
	if (typeof title !== 'string' || !title.trim()) return 'illustration:title';
	if (caption != null && typeof caption !== 'string') return 'illustration:caption';
	if (height != null && !(typeof height === 'number' && height >= ILLUSTRATION_MAX_HEIGHT.min && height <= ILLUSTRATION_MAX_HEIGHT.max)) return 'illustration:max_height';
	if (svg.includes('{')) return 'illustration:expression';
	const check = checkIllustrationSvg(svg);
	if (!check.ok) return `illustration:${check.reason}`;
	if (backslashAttr(svg)) return 'illustration:backslash';
	const notes = checkIllustrationAnnotations({ svg, annotations: props.annotations });
	return notes.ok ? null : `illustration:${notes.reason}`;
}

const shortText = (v: unknown, max: number) => v === undefined || (typeof v === 'string' && v.length <= max && !v.includes('{'));

/** Rule 13 on a `model-viewer` node's props: why it is refused, or null. */
function modelViewerRefusal(props: Record<string, unknown>, partial: boolean): string | null {
	if (MODEL_FILE_PROPS.some((k) => k in props)) return 'model:file';
	const notes = props.annotations;
	if (Array.isArray(notes) && notes.some((n) => isRecord(n) && ('position' in n || 'normal' in n))) return 'model:position';
	if (partial) return null;
	const asset = typeof props.asset === 'string' && Object.hasOwn(MODEL_ASSETS, props.asset) ? MODEL_ASSETS[props.asset] : null;
	if (!asset) return 'model:asset';
	const anchors = new Set(asset.anchors.map((a) => a.name));
	if (notes !== undefined) {
		if (!Array.isArray(notes) || notes.length > MODEL_MAX_NOTES) return 'model:annotations';
		for (const n of notes) {
			if (!isRecord(n) || Object.keys(n).some((k) => !MODEL_NOTE_KEYS.includes(k))) return 'model:annotations';
			if (typeof n.anchor !== 'string' || !anchors.has(n.anchor)) return 'model:anchor';
			if (!shortText(n.label, MODEL_LABEL_MAX)) return 'model:label';
			if (!shortText(n.note, MODEL_NOTE_MAX)) return 'model:note';
		}
	}
	if (props.focus !== undefined && !(typeof props.focus === 'string' && anchors.has(props.focus))) return 'model:focus';
	return null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pinText = (v: unknown) => v === undefined || (typeof v === 'string' && v.length <= ASK_MAX && !/[<{]/.test(v));
const askOnly = (a: unknown) => isRecord(a) && a.action === 'emit' && a.target === 'ask' && Object.keys(a).every((k) => ASK_KEYS.includes(k));

/** Rule 14 on a `map` node's props: why it is refused, or null. */
function mapRefusal(props: Record<string, unknown>, partial: boolean): string | null {
	if (MAP_TILE_PROPS.some((k) => k in props)) return 'map:tiles';
	const { tiles, markers } = props;
	if (tiles !== undefined && !(typeof tiles === 'string' && allowed(['osm'], tiles, partial))) return 'map:tiles';
	const trackers = list(props.trackers);
	const lines = [props.route, ...[...list(props.paths), ...list(props.polygons)].map((p) => (isRecord(p) ? p.points : null)), ...trackers.map((t) => (isRecord(t) ? t.trail : null))];
	if (list(markers).length + trackers.length > MAP_MAX_PINS || lines.reduce<number>((n, l) => n + list(l).length, 0) > MAP_MAX_POINTS) return 'map:size';
	if (partial) return null;
	if (markers !== undefined && !Array.isArray(markers)) return 'map:marker';
	for (const m of list(markers)) {
		if (!isRecord(m) || 'icon' in m || !pinText(m.label) || !pinText(m.popup)) return 'map:marker';
		if (m.actions !== undefined && !(Array.isArray(m.actions) ? m.actions : [m.actions]).every(askOnly)) return 'map:marker';
	}
	return null;
}

function emitRefusal(node: Record<string, unknown>, flow: boolean, ask: boolean | null, partial: boolean): string | null {
	const t = node.target;
	if (typeof t !== 'string') return null;
	if (t === BOOK_CHAT) return 'host_event';
	if (FLOW_EVENTS.includes(t) && !flow && !partial) return 'flow_event';
	if ((t === 'ask' || t === 'flow.submit') && ask !== true) return 'ask_handler';
	if (t === 'ask' && !partial) {
		const v = node.value;
		if (!isRecord(v) || Object.keys(v).join() !== 'text' || !plainText(v.text)) return 'ask_value';
	}
	return null;
}

type Entry = [value: unknown, key: string, isNode: boolean, inState: boolean, ask: boolean | null, depth: number];

/** A flow card's steps as walk entries (each step's `ui` a root node at depth 0), or a refusal. */
function flowSteps(root: Record<string, unknown>, partial: boolean): Entry[] | string {
	const out: Entry[] = [];
	const steps: unknown[] = [root];
	for (let count = 1; steps.length; count++) {
		if (count > MAX_FLOW_STEPS) return 'flow_steps';
		const step = steps.pop();
		// While streaming, a step still being written may not be an object yet.
		if (!isRecord(step)) {
			if (partial) continue;
			return 'flow_step';
		}
		if (!partial && !isRecord(step.ui)) return 'flow_step';
		for (const [k, v] of Object.entries(step)) {
			if (!allowed(FLOW_STEP_KEYS, k, partial)) return `flow_key:${k}`;
			if (k === 'chain') steps.push(v);
			else if (k === 'chain_map') {
				if (!isRecord(v)) {
					if (partial) continue;
					return 'flow_step';
				}
				steps.push(...Object.values(v));
			} else if (k === 'onComplete') {
				const why = onCompleteRefusal(v, partial);
				if (why) return why;
				out.push([v, k, false, false, false, 0]);
			} else out.push([v, k, k === 'ui', false, k === 'ui' ? null : false, 0]);
		}
	}
	return out;
}

export function refuseCard(card: unknown, { partial = false } = {}): string | null {
	if (!isRecord(card)) return 'invalid';
	const { ui } = card;
	const flow = isRecord(ui) && FLOW_FIELDS.some((f) => f in ui);
	const stack: Entry[] = [];
	for (const [key, value] of Object.entries(card)) {
		if (!allowed(CARD_KEYS, key, partial)) return `key:${key}`;
		if (key === 'ui' && flow && isRecord(value)) {
			const steps = flowSteps(value, partial);
			if (typeof steps === 'string') return steps;
			stack.push(...steps);
		} else stack.push([value, key, key === 'ui', key === 'state', key === 'state' ? false : null, 0]);
	}
	let nodes = 0;
	for (let seen = 0; stack.length; seen++) {
		if (seen > MAX_NODES) return 'too_large';
		const [node, key, isNode, inState, ask, depth] = stack.pop()!;
		if (typeof node === 'string') {
			// A streaming `svg` may arrive before its node's `type`; rule 11 runs at final (the server skips it too).
			if (partial && key === 'svg') continue;
			if (HANDLER_KEY.test(key)) return 'handler_expression';
			const why = URL_KEY.test(key) ? urlRefusal(node) : textRefusal(node);
			if (why) return why;
			continue;
		}
		if (Array.isArray(node)) {
			for (const item of node) stack.push([item, key, key === 'children', inState, ask, depth]);
			continue;
		}
		if (!isRecord(node)) continue;
		const type = node.type;
		// A widget node. A node's own `props` never renders as one; its `type` is a prop (an input's `number`).
		const widget = typeof type === 'string' && key !== 'props' && (isNode || !!getWidget(type));
		if (widget && !CHAT_WIDGET_TYPES.has(type)) {
			if (!(partial && isNode && typeNames.some((t) => t.startsWith(type)))) return `widget:${type}`;
		}
		if (widget) {
			if (++nodes > MAX_CARD_NODES) return 'too_many_nodes';
			if (depth + 1 > MAX_DEPTH) return 'too_deep';
		}
		if ('onComplete' in node || (isRecord(node.props) && 'onComplete' in node.props)) return 'on_complete';
		if (type === 'follow-up') {
			const { props } = node;
			if (props !== undefined && !isRecord(props)) return 'follow_up_props';
			if (props && 'event' in props && !(typeof props.event === 'string' && allowed(FOLLOW_UP_EVENTS, props.event, partial))) return 'follow_up_event';
		}
		const nodeProps = node.props;
		if (typeof nodeProps === 'string') return 'props_expression';
		const illustration = widget && type === 'illustration';
		if (illustration) {
			const why = illustrationRefusal(node, isRecord(nodeProps) ? nodeProps : {}, partial);
			if (why) return why;
		}
		if (widget && type === 'model-viewer') {
			const why = modelViewerRefusal(isRecord(nodeProps) ? nodeProps : {}, partial);
			if (why) return why;
		}
		if (widget && type === 'map') {
			const why = mapRefusal(isRecord(nodeProps) ? nodeProps : {}, partial);
			if (why) return why;
		}
		if (typeof type === 'string' && isRecord(nodeProps) && NODE_SLOTS.get(type)?.some((path) => slotExpression(nodeProps, path))) return 'node_expression';
		// An audit-log row's `action` is data (the server's _DATA_ACTION_ROWS); no widget dispatches `entries`.
		if (node.action === 'emit' && !inState && !(ask === null && key === 'entries')) {
			const why = emitRefusal(node, flow, ask, partial);
			if (why) return why;
		}
		const pathTarget = typeof node.action === 'string' && allowed(PATH_TARGET_ACTIONS, node.action, partial);
		// Below a widget met inside a handler (or in state), nothing may ask.
		const base = widget && ask !== null ? false : ask;
		const below = widget ? depth + 1 : depth;
		for (const [k, v] of Object.entries(node)) {
			if (k.toLowerCase() === 'action') {
				if (typeof v === 'string' && !allowed(ALLOWED_ACTIONS, v, partial)) return `action:${v}`;
				if (inState) return 'state_action';
				if (typeof v === 'string') continue;
			}
			// An illustration's svg is held to rule 11, not rule 5.
			const value = illustration && k === 'props' && isRecord(v) ? Object.fromEntries(Object.entries(v).filter(([pk]) => pk !== 'svg')) : v;
			// A state action's target is checked as text (rule 5), not as a URL.
			stack.push([value, pathTarget && k === 'target' ? 'path' : k, false, inState, askFrom(base, k), below]);
		}
	}
	return null;
}
