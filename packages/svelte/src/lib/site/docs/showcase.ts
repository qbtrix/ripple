// site/docs/showcase.ts — Richer, site-only preview specs for widgets whose
// manifest `example` is too small to show them off, or cannot render on the
// public site: placeholder URLs the CSP blocks (example.com images, the CARTO
// tiles, a YouTube frame, a remote GLB), logos that are not in static/, real
// company, ticker and publisher names, or a shape the widget ignores (split's
// children, toast's empty bus). pageSpecs (widgets.ts) previews one of these
// in place of the manifest example when the type has an entry, so both
// /docs/widgets/<type> and /ds pick it up.
//
// Invariants:
// - Site only. The manifest example stays the canonical, minimal one: the
//   pocketpaw chat prompt reads the manifest and has no room for bigger ones,
//   and the .md / llms.txt output still prints the manifest example.
// - Every key is a manifest widget type and the spec contains that widget
//   (the root, except toast, which needs a button to fire one), so the props
//   configurator finds its node. showcase.test.ts checks both, and that each
//   spec passes the spec audit with no warnings (split's `start` and `end`
//   are the one allowed exception; see the test).
// - Same-origin or CSP-allowed assets only: static/logos, static/photos,
//   static/media, the built-in 3D models, images.unsplash.com, i.pravatar.cc
//   and OSM tiles. Links point at real routes, '#', or example.com.
// - Fictional names and data only. Dates are not after the day this was
//   written (2026-10-14), except where the widget is about plans (gantt,
//   calendar). Numbers add up (invoice lines sum to the subtotal).

const spec = (ui: Record<string, unknown>, state?: Record<string, unknown>): Record<string, unknown> => ({
	version: '1.0',
	...(state && { state }),
	ui
});

const LOGOS = [
	{ src: '/logos/brightline.svg', alt: 'Brightline' },
	{ src: '/logos/corvo.svg', alt: 'Corvo' },
	{ src: '/logos/helio-cells.svg', alt: 'Helio Cells' },
	{ src: '/logos/northgrid.svg', alt: 'Northgrid' },
	{ src: '/logos/stratum.svg', alt: 'Stratum' },
	{ src: '/logos/lumen.svg', alt: 'Lumen' }
];
const LAKE = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb';

export const SHOWCASE: Record<string, Record<string, unknown>> = {
	gantt: spec({
		type: 'gantt',
		props: {
			viewMode: 'Week',
			tasks: [
				{ id: 'research', name: 'Discovery interviews', start: '2026-09-07', end: '2026-09-18', progress: 100 },
				{ id: 'wires', name: 'Wireframes', start: '2026-09-14', end: '2026-09-30', progress: 100, dependencies: 'research' },
				{ id: 'tokens', name: 'Design system', start: '2026-09-28', end: '2026-10-16', progress: 80, dependencies: 'wires' },
				{ id: 'api', name: 'API build', start: '2026-10-05', end: '2026-11-06', progress: 45, dependencies: 'wires' },
				{ id: 'app', name: 'App build', start: '2026-10-19', end: '2026-11-20', progress: 15, dependencies: 'tokens, api' },
				{ id: 'beta', name: 'Beta testing', start: '2026-11-16', end: '2026-11-27', progress: 0, dependencies: 'app' },
				{ id: 'review', name: 'Store review', start: '2026-11-30', end: '2026-12-04', progress: 0, dependencies: 'beta' },
				{ id: 'launch', name: 'Launch', start: '2026-12-07', end: '2026-12-07', progress: 0, dependencies: 'review' }
			]
		}
	}),
	treemap: spec({
		type: 'treemap',
		props: {
			title: 'Annual spend by team',
			height: 360,
			data: [
				{
					name: 'Engineering',
					children: [
						{ name: 'Platform', value: 42000 },
						{ name: 'Mobile', value: 31000 },
						{ name: 'Web', value: 27500 },
						{ name: 'Data', value: 18200 }
					]
				},
				{
					name: 'Sales',
					children: [
						{ name: 'Enterprise', value: 38000 },
						{ name: 'Mid-market', value: 21000 },
						{ name: 'Partners', value: 8700 }
					]
				},
				{
					name: 'Marketing',
					children: [
						{ name: 'Paid search', value: 16500 },
						{ name: 'Content', value: 9800 },
						{ name: 'Brand', value: 7200 }
					]
				},
				{
					name: 'Support',
					children: [
						{ name: 'Tier 1', value: 14200 },
						{ name: 'Tier 2', value: 8800 },
						{ name: 'Knowledge base', value: 2100 }
					]
				}
			]
		}
	}),
	workflow: spec({
		type: 'workflow',
		props: {
			title: 'New order fulfilment',
			minimap: true,
			nodes: [
				{ id: 't1', type: 'trigger', label: 'Order placed', icon: 'shopping-cart', status: 'success' },
				{ id: 'a1', type: 'action', label: 'Charge card', icon: 'credit-card', status: 'success' },
				{ id: 'c1', type: 'condition', label: 'Payment approved?', status: 'success' },
				{ id: 'a2', type: 'connector', label: 'Reserve stock', icon: 'package', status: 'running' },
				{ id: 'p1', type: 'approval', label: 'Manager sign-off', status: 'waiting' },
				{ id: 'o1', type: 'output', label: 'Email receipt', icon: 'mail', status: 'idle' },
				{ id: 'o2', type: 'output', label: 'Notify support', icon: 'megaphone', status: 'error' }
			],
			edges: [
				{ from: 't1', to: 'a1' },
				{ from: 'a1', to: 'c1' },
				{ from: 'c1', to: 'a2', label: 'yes' },
				{ from: 'c1', to: 'o2', label: 'no' },
				{ from: 'a2', to: 'p1', animated: true },
				{ from: 'p1', to: 'o1' }
			]
		}
	}),
	'bulk-action-bar': spec({
		type: 'bulk-action-bar',
		props: {
			selectedCount: 48,
			noun: 'conversation',
			position: 'inline',
			actions: [
				{ id: 'assign', label: 'Assign', icon: 'user-plus' },
				{ id: 'tag', label: 'Add tag', icon: 'tag' },
				{ id: 'archive', label: 'Archive', icon: 'archive' },
				{ id: 'export', label: 'Export CSV', icon: 'download', variant: 'outline' },
				{ id: 'spam', label: 'Mark as spam', icon: 'flag', variant: 'destructive' },
				{ id: 'delete', label: 'Delete', icon: 'trash-2', variant: 'destructive' }
			]
		}
	}),
	calendar: spec({
		type: 'calendar',
		props: {
			view: 'month',
			value: '2026-10-14',
			events: [
				{ id: 'plan', title: 'Quarterly planning', start: '2026-10-02', color: 'purple' },
				{ id: 'sprint', title: 'Design sprint', start: '2026-10-05', end: '2026-10-09', color: 'blue' },
				{ id: 'workshop', title: 'Customer workshop', start: '2026-10-08T14:00:00', color: 'orange' },
				{ id: 'roadmap', title: 'Roadmap review', start: '2026-10-12', color: 'green' },
				{ id: 'design', title: 'Design review', start: '2026-10-14T10:30:00', color: 'blue' },
				{ id: 'hiring', title: 'Hiring panel', start: '2026-10-14T15:00:00', color: '#0d9488' },
				{ id: 'offsite', title: 'Team offsite', start: '2026-10-19', end: '2026-10-21', color: 'purple' },
				{ id: 'one-on-one', title: '1:1 with Priya', start: '2026-10-22T11:00:00', color: 'orange' },
				{ id: 'freeze', title: 'Release freeze', start: '2026-10-26', end: '2026-10-30', color: 'red' },
				{ id: 'demo', title: 'Demo day', start: '2026-10-28T16:00:00', color: '#ec4899' },
				{ id: 'retro', title: 'Retro', start: '2026-10-30', color: 'green' }
			]
		}
	}),
	'invoice-layout': spec({
		type: 'invoice-layout',
		props: {
			docType: 'Invoice',
			from: {
				name: 'Fernhill Design Studio',
				address: '14 Larkspur Lane, Portland, OR',
				email: 'billing@fernhill.example',
				taxId: 'US-12-3456789'
			},
			billTo: { name: 'Bluebird Bakery Co.', address: '220 Orchard Ave, Madison, WI', email: 'accounts@bluebird.example' },
			invoiceNumber: 'INV-2026-118',
			issueDate: 'Sep 14, 2026',
			dueDate: 'Oct 14, 2026',
			status: 'sent',
			paymentTerms: 'Net 30',
			lines: [
				{ description: 'Brand refresh: logo and type system', quantity: 1, unitPrice: 2400 },
				{ description: 'Packaging design', quantity: 3, unitPrice: 450, note: 'Three bread and pastry SKUs' },
				{ description: 'Menu board layouts', quantity: 4, unitPrice: 120 },
				{ description: 'Photo retouching (hours)', quantity: 6, unitPrice: 55 }
			],
			// Lines add to 4,560; 8.5% tax on that is 387.60.
			summary: [{ label: 'Tax (8.5%)', value: 387.6 }],
			paymentMethods: [
				{ label: 'Bank transfer', detail: 'Fernhill Design Studio, account ending 4821' },
				{ label: 'Card', detail: 'Pay online with the button below' }
			],
			notes: 'Thank you! Questions about this invoice? Reply to billing@fernhill.example.',
			actions: [
				{ id: 'download', label: 'Download PDF', icon: 'download', variant: 'outline' },
				{ id: 'pay', label: 'Pay invoice', icon: 'credit-card' }
			]
		}
	}),

	// ── Display ─────────────────────────────────────────────────────────
	image: spec({
		type: 'image',
		props: { src: `${LAKE}?w=400&q=70`, alt: 'A mountain lake at dawn', width: 200, height: 150, fit: 'cover', rounded: 'md' }
	}),
	avatar: spec({ type: 'avatar', props: { src: 'https://i.pravatar.cc/64?img=47', alt: 'Maya Okafor', fallback: 'MO' } }),
	parallax: spec({
		type: 'parallax',
		props: { distance: 30 },
		children: [{ type: 'image', props: { src: `${LAKE}?w=600&q=70`, alt: 'A mountain lake at dawn', height: 160, fit: 'cover', rounded: 'md' } }]
	}),
	marquee: spec({
		type: 'marquee',
		props: { duration: 24, pauseOnHover: true },
		children: LOGOS.map((l) => ({ type: 'image', props: { ...l, height: 32 } }))
	}),
	quote: spec({
		type: 'quote',
		props: {
			text: 'Ship the smallest thing that helps someone today, then make it better tomorrow.',
			author: 'Maya Okafor',
			role: 'Founder, Lumen Solar'
		}
	}),
	'soul-status': spec({
		type: 'soul-status',
		props: { name: 'Juniper', role: 'Research assistant', color: '#6366f1', mood: '😊', energy: 85, memories: 342, status: 'online', compact: true }
	}),

	// ── Layout ──────────────────────────────────────────────────────────
	breadcrumb: spec({
		type: 'breadcrumb',
		props: {
			items: [{ label: 'Home', href: '/', icon: 'home' }, { label: 'Design system', href: '/ds' }, { label: 'Atoms' }],
			separator: 'chevron'
		}
	}),
	// The widget reads its panes from `start` and `end`; children never reach them.
	split: spec({
		type: 'split',
		props: {
			direction: 'horizontal',
			defaultSize: 35,
			start: {
				type: 'flex',
				props: { direction: 'column', gap: '4px' },
				class: 'p-3',
				children: [
					{ type: 'text', props: { text: 'Inbox', weight: 'semibold' } },
					{ type: 'text', props: { text: 'Starred', size: 'sm' } },
					{ type: 'text', props: { text: 'Archive', size: 'sm' } }
				]
			},
			end: {
				type: 'flex',
				props: { direction: 'column', gap: '4px' },
				class: 'p-3',
				children: [
					{ type: 'text', props: { text: 'Quarterly planning notes', weight: 'semibold' } },
					{ type: 'text', props: { text: 'Drag the divider to resize the panes.', size: 'sm' } }
				]
			}
		}
	}),

	// ── Input ───────────────────────────────────────────────────────────
	'code-editor': spec(
		{ type: 'code-editor', bind: 'config', props: { label: 'JSON config', language: 'json', height: '200px' } },
		{ config: '{\n  "name": "harbor-api",\n  "port": 5432,\n  "retries": 3,\n  "regions": ["eu-west", "us-east"]\n}' }
	),

	// ── Overlay ─────────────────────────────────────────────────────────
	// Toasts come from the toast action, so the preview gives a button to fire one.
	toast: spec({
		type: 'flex',
		props: { direction: 'column', gap: '12px', align: 'start' },
		children: [
			{ type: 'button', props: { label: 'Show a toast' }, on_click: { action: 'toast', message: 'Changes saved', variant: 'success' } },
			{ type: 'toast', props: { position: 'bottom-right', max: 3 } }
		]
	}),

	// ── Data ────────────────────────────────────────────────────────────
	map: spec({
		type: 'map',
		props: {
			tiles: 'osm',
			center: [37.782, -122.415],
			zoom: 12,
			height: '240px',
			markers: [
				{ id: 'hq', lat: 37.7749, lng: -122.4194, label: 'HQ', icon: 'building', color: 'oklch(0.55 0.18 250)' },
				{ id: 'warehouse', lat: 37.795, lng: -122.405, label: 'Warehouse', color: 'oklch(0.65 0.16 150)', popup: 'Order fulfilment centre' }
			],
			paths: [
				{ id: 'route', points: [[37.7749, -122.4194], [37.785, -122.412], [37.795, -122.405]], color: 'oklch(0.55 0.18 250)', weight: 4, dashed: true, label: 'Delivery route' }
			],
			polygons: [
				{ id: 'zone', points: [[37.765, -122.435], [37.805, -122.435], [37.805, -122.395], [37.765, -122.395]], color: 'oklch(0.65 0.16 150)', fillOpacity: 0.1, label: 'Service area' }
			]
		}
	}),

	// ── Media ───────────────────────────────────────────────────────────
	video: spec({ type: 'video', props: { src: '/media/gradient.mp4', poster: '/media/gradient-poster.jpg', title: 'Gradient loop' } }),
	audio: spec({ type: 'audio', props: { src: '/media/chord.m4a', title: 'C major chord', artist: 'Ripple demo', showWaveform: true } }),
	// The page CSP blocks third-party frames, so the embed shows an inline document. It paints
	// its own dark ground: the frame cannot see the page's theme class.
	embed: spec({
		type: 'embed',
		props: {
			mode: 'srcdoc',
			title: 'Embedded status page',
			height: 180,
			srcdoc:
				'<!doctype html><html><body style="margin:0;font:14px/1.5 system-ui,sans-serif;background:#0f1b2d;color:#e8eef7;display:grid;place-items:center;height:100vh">' +
				'<div style="text-align:center"><div style="font-weight:600;font-size:16px">Harbor API status</div>' +
				'<div style="margin-top:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px"></span>All systems normal</div>' +
				'<div style="margin-top:4px;color:#9fb0c6;font-size:12px">A sandboxed document inside an embed widget</div></div></body></html>'
		}
	}),
	'model-viewer': spec({
		type: 'model-viewer',
		props: {
			asset: 'astronaut',
			alt: 'A 3D model of an astronaut',
			cameraControls: true,
			annotations: [{ anchor: 'helmet', note: 'Holds air at a steady pressure.' }, { anchor: 'chest-pack' }]
		}
	}),
	'location-picker': spec(
		{
			type: 'location-picker',
			bind: 'pickedLocation',
			props: { label: 'Pin the meeting point', center: [40.7128, -74.006], zoom: 12, height: '220px', tiles: 'osm' }
		},
		{ pickedLocation: null }
	),

	// ── Research ────────────────────────────────────────────────────────
	citation: spec({ type: 'citation', props: { source: 'Harbor Ledger', number: 1, url: 'https://example.com/harbor-ledger/rates' } }),
	'company-header': spec({
		type: 'company-header',
		props: {
			name: 'Northgrid Energy',
			ticker: 'NGRD',
			description: 'Builds grid-scale batteries and the software that schedules them.',
			tags: ['Energy', 'Storage'],
			price: '$84.20',
			change: '+1.35',
			changePercent: '+1.63%',
			marketCap: '12.4B'
		}
	}),
	ticker: spec({
		type: 'ticker',
		props: {
			items: [
				{ symbol: 'NGRD', price: '$84.20', change: '+1.35', changePercent: '+1.63%' },
				{ symbol: 'CRVO', price: '$212.48', change: '-0.92', changePercent: '-0.43%' },
				{ symbol: 'HLIO', price: '$37.15', change: '+0.88', changePercent: '+2.43%' }
			]
		}
	}),
	'news-card': spec({
		type: 'news-card',
		props: {
			headline: 'Central bank holds rates steady as inflation cools',
			source: 'The Harbor Ledger',
			time: '2 hours ago',
			sentiment: 'neutral',
			url: 'https://example.com/harbor-ledger/rates'
		}
	}),
	'source-card': spec({
		type: 'source-card',
		props: { source: 'Stackline Weekly', title: 'Warehouse robotics startup raises $50M Series B', color: '#ff6b35', url: 'https://example.com/stackline/robotics' }
	}),
	'sources-bar': spec({
		type: 'sources-bar',
		props: {
			sources: [
				{ name: 'The Harbor Ledger', url: 'https://example.com/harbor-ledger' },
				{ name: 'Stackline Weekly', url: 'https://example.com/stackline' },
				{ name: 'Northside Times', url: 'https://example.com/northside' }
			],
			share: true,
			copy: true
		}
	}),
	'discover-card': spec({
		type: 'discover-card',
		props: {
			title: 'Cloud infrastructure trends for 2026',
			description: 'Key findings on container scheduling and edge computing adoption.',
			source: 'Stackline Weekly',
			url: 'https://example.com/stackline/cloud-trends'
		}
	}),

	// ── Marketing ───────────────────────────────────────────────────────
	'logo-cloud': spec({ type: 'logo-cloud', props: { heading: 'Trusted by teams across the city', logos: LOGOS } })
};
