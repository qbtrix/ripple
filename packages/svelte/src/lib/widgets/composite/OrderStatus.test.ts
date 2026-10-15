// widgets/composite/OrderStatus.test.ts: order-status stepper states. The last
// step renders done (check, no pulse) once status lands on it, the pickup
// statuses get their own default pipeline, and an in-progress step still
// pulses. A failed step shows an X with aria-current and an error pill; a
// cancelled default pipeline has no rail. Updates fold after four, an unknown
// icon slug gets the plain dot, a dead action is not drawn. The map-framing
// case mounts the map on a small Leaflet fake and checks fitBounds runs at
// mount and on origin/destination moves only; a tracker and step update keeps
// the same map node. The polled case drives the widget through Ripple state
// from preparing to delivered and checks the framing, the dashed route and the
// map survive it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Ripple from '$lib/Ripple.svelte';
import OrderStatus from './OrderStatus.svelte';

const leaflet = vi.hoisted(() => {
	const fitBounds = vi.fn();
	const setView = vi.fn();
	const maps = vi.fn();
	const stub = (): any => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => stub()) });
	// Layer groups keep what is on them, so a test can read what the map shows now.
	const groups: Set<any>[] = [];
	const L = {
		map: () => {
			maps();
			return { fitBounds, setView, on() {}, remove() {}, panTo() {}, getSize: () => ({ x: 0, y: 0 }), latLngToContainerPoint: () => ({ x: 0, y: 0 }) };
		},
		tileLayer: stub,
		layerGroup: () => {
			const layers = new Set<any>();
			groups.push(layers);
			const g = {
				addTo: () => g,
				addLayer: (l: any) => layers.add(l),
				removeLayer: (l: any) => layers.delete(l),
				clearLayers: () => layers.clear()
			};
			return g;
		},
		divIcon: (o: unknown) => o,
		polyline: (points: [number, number][], opts: any) => {
			const line = {
				points,
				opts,
				bindTooltip() {},
				setLatLngs: (p: [number, number][]) => (line.points = p),
				setStyle() {}
			};
			return line;
		},
		polygon: stub,
		marker: (p: [number, number]) => {
			let pos = { lat: p[0], lng: p[1] };
			const el = document.createElement('div');
			return {
				setLatLng: (q: [number, number]) => (pos = { lat: q[0], lng: q[1] }),
				getLatLng: () => pos,
				getElement: () => el,
				setIcon() {},
				on() {}
			};
		}
	};
	const drawn = () => groups.flatMap((g) => [...g]);
	return { L, fitBounds, setView, maps, groups, drawn };
});
vi.mock('leaflet', () => ({ default: leaflet.L }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function steps(container: HTMLElement) {
	return [...container.querySelectorAll<HTMLElement>('.rorder-step')].map((li) => ({
		label: li.querySelector('.rorder-step-label')?.textContent?.trim(),
		state: [...li.classList].find((c) => /^rorder-step-(done|active|pending|failed)$/.test(c))?.slice(12),
		check: li.querySelector('.rorder-step-pip svg') !== null,
		pulse: li.querySelector('.rorder-step-pulse') !== null
	}));
}

describe('order-status stepper', () => {
	it('shows delivered as a completed final step with a check, not a pulse', () => {
		const { container } = render(OrderStatus, { props: { orderId: 'A1', status: 'delivered' } });
		const s = steps(container);
		expect(s).toHaveLength(6);
		expect(s.every((x) => x.state === 'done' && x.check)).toBe(true);
		expect(container.querySelector('.rorder-step-pulse')).toBeNull();
		expect(container.querySelector('.rorder-title')?.textContent).toBe('Delivered');
	});

	it('still pulses a step that is in progress', () => {
		const { container } = render(OrderStatus, { props: { orderId: 'A1', status: 'out-for-delivery' } });
		const s = steps(container);
		expect(s[4]).toMatchObject({ label: 'Out for delivery', state: 'active', pulse: true });
		expect(s[5].state).toBe('pending');
	});

	it('uses the pickup pipeline: ready-for-pickup is active, picked-up completes it', () => {
		const ready = render(OrderStatus, { props: { orderId: 'A1', status: 'ready-for-pickup' } });
		const r = steps(ready.container);
		expect(r.map((x) => x.label)).toEqual(['Placed', 'Confirmed', 'Preparing', 'Ready for pickup', 'Picked up']);
		expect(r[3]).toMatchObject({ state: 'active', pulse: true });
		cleanup();

		const done = render(OrderStatus, { props: { orderId: 'A1', status: 'picked-up' } });
		const d = steps(done.container);
		expect(d.every((x) => x.state === 'done' && x.check)).toBe(true);
		expect(done.container.querySelector('.rorder-title')?.textContent).toBe('Picked up');
	});

	it('completes ready-for-pickup when the host steps end there', () => {
		const { container } = render(OrderStatus, {
			props: {
				orderId: 'A1',
				status: 'ready-for-pickup',
				steps: [
					{ id: 'placed', label: 'Placed' },
					{ id: 'preparing', label: 'Preparing' },
					{ id: 'ready-for-pickup', label: 'Ready for pickup' }
				]
			}
		});
		const s = steps(container);
		expect(s[2]).toMatchObject({ state: 'done', check: true, pulse: false });
		expect(container.querySelector('.rorder-title')?.textContent).toBe('Ready for pickup');
	});

	it('keeps an explicitly current last step in progress when it has no completion time', () => {
		const { container } = render(OrderStatus, {
			props: {
				orderId: 'J9',
				steps: [
					{ id: 'build', label: 'Build', completedAt: '10:00' },
					{ id: 'deploy', label: 'Deploy', current: true }
				]
			}
		});
		expect(steps(container)[1]).toMatchObject({ state: 'active', pulse: true });
	});
});

describe('order-status bad news', () => {
	it('marks a failed step that is not the current one with an X and an error pill', () => {
		const { container } = render(OrderStatus, {
			props: {
				orderId: 'HW-77310',
				status: 'failed',
				currentStep: 'out',
				steps: [
					{ id: 'placed', label: 'Placed', completedAt: 'Oct 11' },
					{ id: 'out', label: 'Out for delivery', completedAt: 'Oct 14' },
					{ id: 'attempt', label: 'Delivery attempt', failed: true, description: 'No one was available to sign.' },
					{ id: 'delivered', label: 'Delivered' }
				],
				eta: 'Next attempt tomorrow'
			}
		});
		expect(steps(container).map((x) => x.state)).toEqual(['done', 'done', 'failed', 'pending']);
		const failed = container.querySelectorAll('.rorder-step')[2];
		expect(failed.getAttribute('aria-current')).toBe('step');
		expect(failed.querySelector('.rorder-step-pip svg')).not.toBeNull();
		expect(container.querySelector('.rorder-title')?.textContent).toBe('Delivery attempt');
		expect(container.querySelector('[data-status="bad"]')?.textContent).toContain('Failed');
		expect(container.querySelector('.rorder-step-desc')?.textContent).toBe('No one was available to sign.');
		// The value already says "Next", so the label word steps aside.
		expect(container.querySelector('.rorder-when')?.textContent?.trim()).toBe('Next attempt tomorrow');
		expect(container.querySelector('.rorder-when-label')).toBeNull();
		expect(container.querySelectorAll('.rorder-step-line[data-line="dotted"]')).toHaveLength(1);
		expect(container.textContent).not.toMatch(/paused/i);
	});

	it('draws no rail for a cancelled default pipeline', () => {
		const { container } = render(OrderStatus, { props: { orderId: 'LB-1', status: 'cancelled' } });
		expect(container.querySelector('.rorder-steps')).toBeNull();
		expect(container.querySelector('.rorder-title')?.textContent).toBe('Order cancelled');
		expect(container.querySelector('[data-status="bad"]')?.textContent).toContain('Cancelled');
		expect(container.querySelector('.rorder-map')).toBeNull();
	});
});

describe('order-status updates and actions', () => {
	it('folds after four updates and unfolds on click', async () => {
		const events = Array.from({ length: 9 }, (_, i) => ({ time: `${i}:00`, label: `Update ${i}` }));
		const { container, getByRole } = render(OrderStatus, { props: { orderId: 'A1', events } });
		expect(container.querySelectorAll('.rorder-event')).toHaveLength(4);
		const fold = getByRole('button', { name: 'Show 5 earlier updates' });
		await fireEvent.click(fold);
		expect(container.querySelectorAll('.rorder-event')).toHaveLength(9);
		expect(fold.textContent?.trim()).toBe('Show fewer');
	});

	it('keeps labels aligned: an icon sits in the marker, an unknown slug is the dot', () => {
		const { container } = render(OrderStatus, {
			props: {
				orderId: 1042 as unknown as string,
				events: [
					{ label: '**Delivered** to the front desk', icon: 'rocket-ship-xyz' },
					{ time: '08:00', label: '- Departed facility', icon: 'truck' },
					{ time: 'Yesterday', label: '' }
				] as { time: string; label: string; icon?: string }[]
			}
		});
		const rows = [...container.querySelectorAll('.rorder-event')];
		expect(rows.map((r) => r.querySelector('.rorder-event-label')?.textContent)).toEqual(['Delivered to the front desk', 'Departed facility']);
		expect(rows[0].querySelector('.rorder-event-mark svg')).toBeNull();
		expect(rows[1].querySelector('.rorder-event-mark svg')).not.toBeNull();
		expect(container.querySelector('.rorder-event-label svg')).toBeNull();
		expect(container.querySelector('.rorder-eyebrow')?.textContent).toBe('Order 1042');
	});

	it('drops an action that can do nothing and draws an unknown variant as outline', async () => {
		const onaction = vi.fn();
		const { container, getByRole } = render(OrderStatus, {
			props: {
				orderId: 'A1',
				onaction,
				actions: [{ label: 'Track on the carrier site' }, { id: 'help', label: 'Help', variant: 'link' as 'outline' }]
			}
		});
		expect(container.querySelectorAll('.rorder-btn')).toHaveLength(1);
		const help = getByRole('button', { name: 'Help' });
		expect(help.classList.contains('rorder-btn-outline')).toBe(true);
		await fireEvent.click(help);
		expect(onaction).toHaveBeenCalledWith('help');
	});
});

describe('order-status map framing', () => {
	it('fits the whole trip clear of the map chrome at mount and refits only when origin or destination move', async () => {
		vi.stubGlobal('requestAnimationFrame', () => 1);
		vi.stubGlobal('cancelAnimationFrame', () => {});
		leaflet.fitBounds.mockClear();
		const origin = { name: 'Kitchen', lat: 10, lng: 20 };
		const destination = { name: 'Home', lat: 10.2, lng: 20.3 };
		const { rerender } = render(OrderStatus, {
			props: { orderId: 'A1', origin, destination, route: [[9.9, 20.1]], tracker: { lat: 10.1, lng: 20.4 } }
		});
		await vi.waitFor(() => expect(leaflet.fitBounds).toHaveBeenCalledTimes(1));
		expect(leaflet.fitBounds).toHaveBeenLastCalledWith(
			[
				[9.9, 20],
				[10.2, 20.4]
			],
			{ paddingTopLeft: [44, 58], paddingBottomRight: [28, 32] }
		);
		expect(leaflet.setView).not.toHaveBeenCalled();

		// Courier polls, with origin/destination re-sent as fresh but equal objects.
		await rerender({ tracker: { lat: 10.15, lng: 20.5 }, origin: { ...origin }, destination: { ...destination } });
		await rerender({ tracker: { lat: 10.18, lng: 20.6 } });
		expect(leaflet.fitBounds).toHaveBeenCalledTimes(1);

		await rerender({ destination: { name: 'Office', lat: 10.5, lng: 20.3 } });
		expect(leaflet.fitBounds).toHaveBeenCalledTimes(2);
		expect(leaflet.fitBounds).toHaveBeenLastCalledWith(
			[
				[9.9, 20],
				[10.5, 20.6]
			],
			{ paddingTopLeft: [44, 58], paddingBottomRight: [28, 32] }
		);
	});
});

describe('order-status host polling', () => {
	it('keeps the same map node and Leaflet map when the tracker and step change', async () => {
		vi.stubGlobal('requestAnimationFrame', () => 1);
		vi.stubGlobal('cancelAnimationFrame', () => {});
		leaflet.maps.mockClear();
		const base = {
			orderId: 'B7C2E91A',
			steps: [
				{ id: 'confirmed', label: 'Confirmed', completedAt: '18 min ago' },
				{ id: 'out', label: 'On the way' },
				{ id: 'delivered', label: 'Delivered' }
			],
			currentStep: 'confirmed',
			origin: { name: 'Kitchen', lat: 37.7764, lng: -122.4172 },
			destination: { name: 'Drop-off', lat: 37.788, lng: -122.401 },
			tracker: { lat: 37.779, lng: -122.414 },
			showMap: true,
			mapHeight: '260px'
		};
		const { container, rerender } = render(OrderStatus, { props: base });
		await vi.waitFor(() => expect(leaflet.maps).toHaveBeenCalledTimes(1));
		const map = container.querySelector('.rorder-map');
		const leafletEl = container.querySelector('.rmap');
		await rerender({ ...base, currentStep: 'out', tracker: { lat: 37.7815, lng: -122.4101 } });
		await rerender({ ...base, currentStep: 'delivered', tracker: undefined, eta: '' });
		expect(container.querySelector('.rorder-map')).toBe(map);
		expect(container.querySelector('.rmap')).toBe(leafletEl);
		expect(leaflet.maps).toHaveBeenCalledTimes(1);
	});
});

describe('order-status polled to delivered', () => {
	// The host shape: a fixed spec whose props read state, and each poll replaces
	// the state (routes/pay/orders.ts trackState in the landing). Same demo
	// geography as the store: a 10-point route from the kitchen to the drop-off.
	const ROUTE: [number, number][] = [
		[40.740298, -74.002095],
		[40.740938, -74.000913],
		[40.741377, -73.99987],
		[40.741821, -73.998817],
		[40.742264, -73.997765],
		[40.742706, -73.996713],
		[40.743146, -73.995661],
		[40.743591, -73.994609],
		[40.743235, -73.993705],
		[40.742902, -73.992804]
	];
	const KITCHEN = { name: 'Kitchen', lat: 40.740298, lng: -74.002095 };
	const DROP_OFF = { name: 'Drop-off', lat: 40.742902, lng: -73.992804 };
	const keys = ['orderId', 'status', 'origin', 'destination', 'tracker', 'route'];
	const spec = {
		version: '1.0',
		ui: {
			type: 'order-status',
			id: 'order-track',
			props: { ...Object.fromEntries(keys.map((k) => [k, `{state.${k}}`])), showMap: true }
		}
	};
	const poll = (status: string, courier: { lat: number; lng: number } | null, route: [number, number][]) => ({
		orderId: 'A1',
		status,
		origin: { ...KITCHEN },
		destination: { ...DROP_OFF },
		tracker: courier && { ...courier, label: 'Courier' },
		route: route.map((p) => [...p])
	});
	const routeLines = () =>
		leaflet.drawn().filter((l) => l.opts?.dashArray === '8, 8' && l.points.length === ROUTE.length);

	it.each([
		['the courier at the drop-off and the route unchanged', { lat: DROP_OFF.lat, lng: DROP_OFF.lng }, ROUTE],
		['no courier and an empty route', null, []]
	])('keeps the framing, the route and the map at delivered with %s', async (_n, courier, finalRoute) => {
		vi.stubGlobal('requestAnimationFrame', () => 1);
		vi.stubGlobal('cancelAnimationFrame', () => {});
		leaflet.fitBounds.mockClear();
		leaflet.maps.mockClear();
		leaflet.groups.length = 0;

		const { rerender } = render(Ripple, { props: { spec, state: poll('preparing', null, ROUTE) } });
		await vi.waitFor(() => expect(leaflet.fitBounds).toHaveBeenCalledTimes(1));
		const framed = leaflet.fitBounds.mock.calls[0];

		for (const c of [ROUTE[3], ROUTE[5], ROUTE[8]]) {
			await rerender({ spec, state: poll('out-for-delivery', { lat: c[0], lng: c[1] }, ROUTE) });
			await tick();
		}
		await rerender({ spec, state: poll('delivered', courier, finalRoute as [number, number][]) });
		await tick();

		// Same rectangle the whole way, fitted once.
		expect(leaflet.fitBounds).toHaveBeenCalledTimes(1);
		expect(leaflet.fitBounds.mock.calls.at(-1)).toEqual(framed);
		// The dashed route is still on the map, with its real points.
		expect(routeLines()).toHaveLength(1);
		expect(routeLines()[0].points).toEqual(ROUTE);
		// One Leaflet map for the whole session.
		expect(leaflet.maps).toHaveBeenCalledTimes(1);
	});
});
