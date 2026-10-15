// order-status-data.test.ts: the status aliases, the step-state rule (with a
// failed step that is not the current one), the headline and when-line label
// per state, and the hygiene of events, actions and points, using the shapes
// of the worst-case specs.
import { describe, expect, it } from 'vitest';
import {
	EVENT_FOLD,
	cleanActions,
	cleanEvents,
	cleanPlace,
	etaLabel,
	headline,
	normStatus,
	point,
	progress
} from './order-status-data.js';

describe('normStatus', () => {
	it.each([
		['out-for-delivery', 'out-for-delivery'],
		[' Out For Delivery ', 'out-for-delivery'],
		['in_transit', 'in-transit'],
		['shipped', 'in-transit'],
		['dispatched', 'in-transit'],
		['canceled', 'cancelled'],
		['ready', 'ready-for-pickup'],
		['completed', 'delivered'],
		['complete', 'delivered'],
		['lost in space', undefined],
		[42, undefined],
		[undefined, undefined]
	])('%j is %j', (input, want) => expect(normStatus(input)).toBe(want));
});

const REPAIR = [
	{ id: 'requested', label: 'Repair requested', completedAt: 'Oct 2' },
	{ id: 'received', label: 'Received', completedAt: 'Oct 6' },
	{ id: 'repair', label: 'Repair in progress', description: 'Parts are being fitted.' },
	{ id: 'return', label: 'Shipped back to you' }
];

describe('progress', () => {
	it('walks the delivery pipeline by status', () => {
		const p = progress(undefined, 'out-for-delivery', undefined);
		expect(p.pipeline).toBe('delivery');
		expect(p.states).toEqual(['done', 'done', 'done', 'done', 'active', 'pending']);
		expect(p.finished).toBe(false);
	});

	it('finishes when status lands on the last step', () => {
		const p = progress(undefined, 'delivered', undefined);
		expect(p.states.every((s) => s === 'done')).toBe(true);
		expect(p.finished).toBe(true);
	});

	it('switches to the pickup pipeline', () => {
		expect(progress(undefined, 'ready-for-pickup', undefined).pipeline).toBe('pickup');
		expect(progress([], 'picked-up', undefined)).toMatchObject({ pipeline: 'pickup', finished: true });
	});

	it('maps an aliased status onto its step', () => {
		const p = progress(undefined, 'shipped', undefined);
		expect(p.steps[p.active].label).toBe('In transit');
	});

	it('matches a custom step by the raw status word before the alias', () => {
		const p = progress([{ id: 'placed', label: 'Placed' }, { id: 'shipped', label: 'Shipped' }, { id: 'in', label: 'In' }], 'shipped', undefined);
		expect(p.active).toBe(1);
	});

	it('uses currentStep on custom steps and ignores one that names no step', () => {
		expect(progress(REPAIR, undefined, 'repair').active).toBe(2);
		expect(progress(REPAIR, undefined, 'nope').active).toBe(2); // first without completedAt
	});

	it('makes a failed step the active one whatever status and currentStep say', () => {
		const steps = [
			{ id: 'placed', label: 'Placed', completedAt: 'Oct 11' },
			{ id: 'out', label: 'Out for delivery', completedAt: 'Oct 14' },
			{ id: 'attempt', label: 'Delivery attempt', failed: true, completedAt: 'Oct 14' },
			{ id: 'delivered', label: 'Delivered' }
		];
		const p = progress(steps, 'failed', 'out');
		expect(p.states).toEqual(['done', 'done', 'failed', 'pending']);
		expect(p).toMatchObject({ active: 2, bad: 'failed', showRail: true, finished: false });
		expect(headline(undefined, p)).toBe('Delivery attempt');
		expect(etaLabel(p)).toBe('Next step');
		expect(etaLabel(p, 'Next attempt tomorrow, 9 AM to 1 PM')).toBe('');
		expect(etaLabel(p, 'Tomorrow, 9 AM')).toBe('Next step');
	});

	it('marks the current custom step failed when status is failed and no step is', () => {
		const p = progress(REPAIR, 'failed', undefined);
		expect(p.states).toEqual(['done', 'done', 'failed', 'pending']);
	});

	it('hides the rail for a failed or cancelled default pipeline', () => {
		for (const s of ['failed', 'cancelled', 'canceled']) {
			const p = progress(undefined, s, undefined);
			expect(p.showRail).toBe(false);
			expect(p.active).toBe(-1);
		}
		expect(headline(undefined, progress(undefined, 'cancelled', undefined))).toBe('Order cancelled');
		expect(headline(undefined, progress(undefined, 'failed', undefined))).toBe('Delivery failed');
	});

	it('keeps an explicitly current last step in progress without a completion time', () => {
		const p = progress([{ id: 'build', label: 'Build', completedAt: '10:00' }, { id: 'deploy', label: 'Deploy', current: true }], undefined, undefined);
		expect(p.states).toEqual(['done', 'active']);
		expect(p.finished).toBe(false);
	});

	it('never throws on junk', () => {
		expect(() => progress('steps', {}, 7)).not.toThrow();
		const p = progress([null, 3, { label: '**Packed**' }], undefined, undefined);
		expect(p.steps.map((s) => s.label)).toEqual(['Packed']);
	});
});

describe('headline and etaLabel', () => {
	it('prefers the title, plain', () => {
		expect(headline('**On the way**', progress(undefined, 'in-transit', undefined))).toBe('On the way');
	});

	it.each([
		['out-for-delivery', 'Out for delivery', 'Estimated arrival'],
		['delivered', 'Delivered', 'Delivered'],
		['ready-for-pickup', 'Ready for pickup', 'Pickup'],
		['picked-up', 'Picked up', 'Picked up'],
		['cancelled', 'Order cancelled', 'Next step']
	])('%s reads %j with %j', (status, head, label) => {
		const p = progress(undefined, status, undefined);
		expect(headline(undefined, p)).toBe(head);
		expect(etaLabel(p)).toBe(label);
	});
});

describe('cleanEvents', () => {
	it('keeps the given order, strips markdown, drops label-less rows, keys repeats', () => {
		const ev = cleanEvents([
			{ label: '**Delivered** to the front desk', icon: 'rocket-ship-xyz' },
			{ time: '', label: 'Out for delivery', location: '' },
			{ time: '08:00', label: '- Departed facility', icon: 'truck' },
			{ time: 'Yesterday', label: '' },
			'junk',
			{ time: '08:00', label: '- Departed facility' }
		]);
		expect(ev.map((e) => e.label)).toEqual(['Delivered to the front desk', 'Out for delivery', 'Departed facility', 'Departed facility']);
		expect(ev[0]).toMatchObject({ time: '', location: '', icon: 'rocket-ship-xyz' });
		expect(new Set(ev.map((e) => e.key)).size).toBe(4);
	});

	it('folds after four', () => {
		expect(EVENT_FOLD).toBe(4);
	});
});

describe('cleanActions', () => {
	it('drops dead actions and reads an unknown variant as outline', () => {
		const a = cleanActions([
			{ label: 'Track on the carrier site' },
			{ id: 'help', label: 'Help', variant: 'link' },
			{ id: 'go', label: 'Go' },
			{ label: 'Wired', actions: { action: 'toast', message: 'hi' }, variant: 'ghost' },
			{ id: 'x', label: '' },
			{ id: 'go', label: 'Go again', variant: 'outline' }
		]);
		expect(a.map((x) => [x.label, x.variant])).toEqual([
			['Help', 'outline'],
			['Go', 'default'],
			['Wired', 'ghost'],
			['Go again', 'outline']
		]);
		expect(new Set(a.map((x) => x.key)).size).toBe(4);
	});
});

describe('point and cleanPlace', () => {
	it('accepts 0, pairs and objects; rejects strings and NaN', () => {
		expect(point([0, 0])).toEqual([0, 0]);
		expect(point({ lat: 37.7, lng: -122.4 })).toEqual([37.7, -122.4]);
		expect(point({ lat: '37.7', lng: -122.4 })).toBeUndefined();
		expect(point([NaN, 1])).toBeUndefined();
		expect(point(undefined)).toBeUndefined();
	});

	it('names a place by its fallback only when it has an address', () => {
		expect(cleanPlace({ address: 'Oakland, CA' }, 'Origin')).toMatchObject({ name: 'Origin', listed: true });
		expect(cleanPlace({ lat: 1, lng: 2 }, 'Origin')).toMatchObject({ name: '', listed: false, at: [1, 2] });
		expect(cleanPlace('nowhere', 'Origin')).toBeUndefined();
	});
});
