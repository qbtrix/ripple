// widgets/composite/order-status-data.ts: the pure half of order-status. It
// turns the model's props into what the template only paints: a known status,
// the step list with one state per step, the headline, the label of the when
// line, clean events and actions, and finite map points. Nothing here throws;
// bad items are skipped and bad fields degrade.
//
// Step rule (one place): steps before the active index are done; the active
// one is current, or done once the pipeline is finished; a step with
// `failed: true` is failed and becomes the active index whatever `status`
// says, and the steps after it are pending behind dotted connectors. On the
// default pipelines a failed or cancelled status with no failed step hides
// the rail (the headline and pill carry it); on custom steps it marks the
// current step failed. The last step is done, not in progress, once status
// lands on it or it has `completedAt`; an explicit `current` on it without
// either stays in progress.
//
// Status is read leniently: case, spaces and underscores are folded and a few
// common words alias onto the known set (shipped is in-transit). A custom
// step whose id is the raw word still matches it first.
import { asText } from '@ripple-ui/core';
import { plain } from '../data-kit/format.js';
import { safeArray, uniqueKeys } from '$lib/utils/safe-props.js';

export type DefaultStatus =
	| 'placed'
	| 'confirmed'
	| 'preparing'
	| 'in-transit'
	| 'out-for-delivery'
	| 'delivered'
	| 'ready-for-pickup'
	| 'picked-up'
	| 'failed'
	| 'cancelled';

export type StepState = 'done' | 'active' | 'pending' | 'failed';
export type Pipeline = 'delivery' | 'pickup' | 'custom';
export type LatLng = [number, number];

export interface Step {
	id: string;
	label: string;
	description: string;
	completedAt: string;
}

export interface Progress {
	pipeline: Pipeline;
	steps: Step[];
	states: StepState[];
	/** The current (or failed, or last when finished) step; -1 when the rail is hidden. */
	active: number;
	finished: boolean;
	/** 'failed' or 'cancelled' when the order went wrong, else undefined. */
	bad: 'failed' | 'cancelled' | undefined;
	showRail: boolean;
}

const KNOWN: readonly DefaultStatus[] = [
	'placed',
	'confirmed',
	'preparing',
	'in-transit',
	'out-for-delivery',
	'delivered',
	'ready-for-pickup',
	'picked-up',
	'failed',
	'cancelled'
];

const ALIAS: Record<string, DefaultStatus> = {
	shipped: 'in-transit',
	dispatched: 'in-transit',
	canceled: 'cancelled',
	ready: 'ready-for-pickup',
	completed: 'delivered',
	complete: 'delivered'
};

const DELIVERY_STEPS: readonly Step[] = [
	['placed', 'Placed'],
	['confirmed', 'Confirmed'],
	['preparing', 'Preparing'],
	['in-transit', 'In transit'],
	['out-for-delivery', 'Out for delivery'],
	['delivered', 'Delivered']
].map(([id, label]) => ({ id, label, description: '', completedAt: '' }));

const PICKUP_STEPS: readonly Step[] = [
	['placed', 'Placed'],
	['confirmed', 'Confirmed'],
	['preparing', 'Preparing'],
	['ready-for-pickup', 'Ready for pickup'],
	['picked-up', 'Picked up']
].map(([id, label]) => ({ id, label, description: '', completedAt: '' }));

/** Updates shown before the fold. */
export const EVENT_FOLD = 4;

/** The written status folded to a key: trimmed, lower case, spaces and underscores to `-`. */
export function statusKey(v: unknown): string {
	return asText(v).trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/** A known status, through the aliases; anything else is undefined. */
export function normStatus(v: unknown): DefaultStatus | undefined {
	const k = statusKey(v);
	if ((KNOWN as readonly string[]).includes(k)) return k as DefaultStatus;
	return ALIAS[k];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The step list and per-step states (see the rule in the header). */
export function progress(rawSteps: unknown, rawStatus: unknown, currentStep: unknown): Progress {
	const status = normStatus(rawStatus);
	const key = statusKey(rawStatus);
	const custom = safeArray<unknown>(rawSteps).filter(isRecord);
	const pipeline: Pipeline = custom.length
		? 'custom'
		: status === 'ready-for-pickup' || status === 'picked-up'
			? 'pickup'
			: 'delivery';
	const steps: Step[] =
		pipeline === 'custom'
			? custom.map((s, i) => ({
					id: asText(s.id) || String(i),
					label: plain(s.label) || plain(s.id) || `Step ${i + 1}`,
					description: plain(s.description),
					completedAt: plain(s.completedAt)
				}))
			: (pipeline === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS).map((s) => ({ ...s }));
	const flags = pipeline === 'custom' ? custom : [];
	const bad = status === 'failed' || status === 'cancelled' ? status : undefined;
	const last = steps.length - 1;

	const find = (id: string) => (id ? steps.findIndex((s) => s.id === id) : -1);
	const failedStep = flags.findIndex((s) => s.failed === true);

	// The step the order is at, ignoring failure.
	let at = find(asText(currentStep));
	if (at < 0 && !bad) at = find(key) >= 0 ? find(key) : status ? find(status) : -1;
	if (at < 0) at = flags.findIndex((s) => s.current === true);
	if (at < 0) {
		const open = steps.findIndex((s) => !s.completedAt);
		at = open >= 0 ? open : last;
	}

	let failedAt = -1;
	if (failedStep >= 0) failedAt = failedStep;
	else if (bad && pipeline === 'custom') failedAt = at;

	const anyBad = failedAt >= 0 ? (bad ?? 'failed') : bad;
	const showRail = !(bad && failedAt < 0);
	const active = !showRail ? -1 : failedAt >= 0 ? failedAt : at;
	const finished =
		!anyBad && active === last && (key === steps[last]?.id || status === steps[last]?.id || Boolean(steps[last]?.completedAt));

	const states: StepState[] = steps.map((_, i) => {
		if (!showRail) return 'pending';
		if (i < active) return 'done';
		if (i > active) return 'pending';
		return failedAt >= 0 ? 'failed' : finished ? 'done' : 'active';
	});

	return { pipeline, steps, states, active, finished, bad: anyBad, showRail };
}

/** The card's headline: the title, else what the steps say now. */
export function headline(title: unknown, p: Progress): string {
	const t = plain(title);
	if (t) return t;
	if (p.bad === 'cancelled') return 'Order cancelled';
	if (p.bad) return p.active >= 0 ? p.steps[p.active].label : 'Delivery failed';
	if (p.finished) return p.steps[p.steps.length - 1]?.label ?? 'Delivered';
	return p.steps[p.active]?.label ?? 'Order status';
}

/** The word before the ETA value. */
export function etaLabel(p: Progress): string {
	if (p.bad) return 'Next step';
	if (p.finished) return p.steps[p.steps.length - 1]?.label ?? 'Delivered';
	if (p.pipeline === 'pickup') return 'Pickup';
	return 'Estimated arrival';
}

export interface CleanEvent {
	key: string;
	label: string;
	time: string;
	location: string;
	icon: string;
}

/** Events as given (newest first, never sorted); a label-less one is dropped. */
export function cleanEvents(raw: unknown): CleanEvent[] {
	const rows = safeArray<unknown>(raw)
		.filter(isRecord)
		.map((e) => ({ label: plain(e.label), time: plain(e.time), location: plain(e.location), icon: asText(e.icon).trim() }))
		.filter((e) => e.label);
	const keys = uniqueKeys(rows, (e) => `${e.time}|${e.label}`);
	return rows.map((e, i) => ({ ...e, key: keys[i] }));
}

export type Variant = 'default' | 'outline' | 'ghost';

export interface CleanAction<H> {
	key: string;
	id: string;
	label: string;
	icon: string;
	variant: Variant;
	actions: H | undefined;
}

/** Actions that can do something: one with neither an id nor handlers is dropped. */
export function cleanActions<H = unknown>(raw: unknown): CleanAction<H>[] {
	const rows = safeArray<unknown>(raw)
		.filter(isRecord)
		.map((a) => {
			const v = asText(a.variant);
			return {
				id: asText(a.id).trim(),
				label: plain(a.label),
				icon: asText(a.icon).trim(),
				variant: (v === 'default' || v === 'ghost' ? v : a.variant == null ? 'default' : 'outline') as Variant,
				actions: (a.actions ?? undefined) as H | undefined
			};
		})
		.filter((a) => a.label && (a.id || a.actions));
	const keys = uniqueKeys(rows, (a, i) => a.id || `action-${i}`);
	return rows.map((a, i) => ({ ...a, key: keys[i] }));
}

/** A finite [lat, lng] from a pair or a {lat, lng} object; 0 counts, strings do not. */
export function point(v: unknown): LatLng | undefined {
	const lat = Array.isArray(v) ? v[0] : isRecord(v) ? v.lat : undefined;
	const lng = Array.isArray(v) ? v[1] : isRecord(v) ? v.lng : undefined;
	return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
		? [lat, lng]
		: undefined;
}

export interface CleanPlace {
	name: string;
	address: string;
	at: LatLng | undefined;
	/** Drawn in the From / To list (it has a name or an address). */
	listed: boolean;
}

/** A place with plain text and a finite point; `fallback` names it only when an address exists. */
export function cleanPlace(v: unknown, fallback: string): CleanPlace | undefined {
	if (!isRecord(v)) return undefined;
	const address = plain(v.address);
	const name = plain(v.name) || (address ? fallback : '');
	return { name, address, at: point(v), listed: Boolean(name || address) };
}

export interface CleanTracking {
	carrier: string;
	number: string;
	url: string;
}

/** Carrier and number as text (a model may send numbers); no number, no tracking. */
export function cleanTracking(v: unknown): CleanTracking | undefined {
	if (!isRecord(v)) return undefined;
	const number = asText(v.number).trim();
	return number ? { carrier: plain(v.carrier), number, url: asText(v.url).trim() } : undefined;
}
