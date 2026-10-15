// site/docs/showcase.ts: richer, site-only preview specs for widgets whose
// manifest `example` is too small to show them off, or cannot render on the
// public site: placeholder URLs the CSP in svelte.config.js blocks
// (example.com images, the CARTO tiles, a third-party frame, a remote GLB),
// logos that are not in static/, real company, ticker and publisher names,
// links to pages the site lacks, or a shape the widget ignores (split's
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
//   calendar, itinerary). Numbers add up (invoice lines sum to the subtotal, funnel
//   stages only shrink, a sankey node never sends out more than it takes in;
//   the remainder shows as a drop-off).

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
	'avatar-group': spec({
		type: 'avatar-group',
		props: {
			max: 3,
			size: 'md',
			users: [
				{ src: 'https://i.pravatar.cc/96?img=32', alt: 'Alice' },
				{ src: 'https://i.pravatar.cc/96?img=12', alt: 'Bob' },
				{ fallback: 'CD', alt: 'Charlie' },
				{ fallback: 'EF', alt: 'Eve' }
			]
		}
	}),
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
	'logo-cloud': spec({ type: 'logo-cloud', props: { heading: 'Trusted by teams across the city', logos: LOGOS } }),

	heatmap: spec({
		type: 'heatmap',
		props: {
			title: 'Orders by weekday and hour',
			showLabels: true,
			height: 120,
			...(() => {
				const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
				const rows: Record<string, number[]> = {
					Mon: [0, 7, 5, 3, 2, 12, 17, 32, 59, 94, 135, 150, 145, 131, 133, 133, 127, 105, 69, 44, 20, 8, 2, 8],
					Tue: [3, 1, 8, 6, 5, 6, 11, 35, 62, 97, 129, 153, 148, 134, 127, 127, 130, 108, 72, 38, 23, 11, 5, 2],
					Wed: [6, 4, 2, 0, 8, 9, 14, 29, 65, 100, 132, 147, 142, 137, 130, 130, 124, 111, 75, 41, 17, 5, 8, 5],
					Thu: [1, 5, 4, 2, 3, 10, 15, 30, 57, 91, 131, 146, 141, 128, 136, 135, 129, 102, 66, 46, 22, 9, 3, 6],
					Fri: [4, 2, 6, 5, 4, 8, 13, 38, 66, 101, 126, 149, 151, 139, 131, 124, 133, 112, 81, 52, 31, 16, 9, 4],
					Sat: [6, 4, 2, 0, 7, 6, 7, 11, 28, 39, 49, 53, 50, 53, 49, 47, 44, 44, 30, 17, 7, 2, 7, 5],
					Sun: [0, 7, 5, 3, 1, 9, 10, 14, 22, 33, 52, 56, 53, 47, 52, 50, 47, 38, 24, 20, 10, 5, 1, 8]
				};
				return {
					xLabels: hours,
					yLabels: Object.keys(rows),
					cells: Object.entries(rows).flatMap(([y, values]) => values.map((value, i) => ({ x: hours[i], y, value })))
				};
			})()
		}
	}),
	'audit-log': spec({
		type: 'audit-log',
		props: {
			groupBy: 'day',
			showFilters: true,
			entries: [
				{ id: 'ev-1000', actor: 'Priya Raman', action: 'created API key', target: 'key:pk_test_174', type: 'api', timestamp: '2026-09-20 11:52 UTC', severity: 'info' },
				{ id: 'ev-999', actor: 'Hannah Weiss', action: 'revoked API key', target: 'key:pk_test_319', type: 'api', timestamp: '2026-09-20 10:02 UTC', severity: 'destructive', details: { ip: '203.0.113.109', client: 'web', requestId: 'req_42301241' } },
				{ id: 'ev-998', actor: 'Priya Raman', action: 'reset password', target: 'user:hannah', type: 'auth', timestamp: '2026-09-19 17:36 UTC', severity: 'info', details: { ip: '203.0.113.59', client: 'cli', requestId: 'req_94212661' } },
				{ id: 'ev-997', actor: 'Kofi Mensah', action: 'failed sign-in', target: 'session:web', type: 'auth', timestamp: '2026-09-19 10:02 UTC', severity: 'warning' },
				{ id: 'ev-996', actor: 'Grace Okafor', action: 'issued refund', target: 'invoice #653', type: 'billing', timestamp: '2026-09-18 17:07 UTC', severity: 'warning' },
				{ id: 'ev-995', actor: 'Samuel Adeyemi', action: 'renamed', target: 'workspace:orchard-199', type: 'workspace', timestamp: '2026-09-18 13:35 UTC', severity: 'info' },
				{ id: 'ev-994', actor: 'Hannah Weiss', action: 'invited member', target: 'tomas@larkspur.example', type: 'user', timestamp: '2026-09-17 10:56 UTC', severity: 'info' },
				{ id: 'ev-993', actor: 'Rafael Duarte', action: 'disabled webhook', target: 'hook:624', type: 'webhook', timestamp: '2026-09-17 08:26 UTC', severity: 'warning', details: { ip: '203.0.113.89', client: 'web', requestId: 'req_75627516' } },
				{ id: 'ev-992', actor: 'Hannah Weiss', action: 'connected', target: 'calendar sync', type: 'integration', timestamp: '2026-09-16 20:50 UTC', severity: 'success' },
				{ id: 'ev-991', actor: 'Henrik Dahl', action: 'updated payment method', target: 'card ending 4417', type: 'billing', timestamp: '2026-09-15 15:18 UTC', severity: 'info', details: { ip: '203.0.113.65', client: 'mobile', requestId: 'req_62472380' } },
				{ id: 'ev-990', actor: 'System', actorIcon: 'bot', action: 'deleted bucket', target: 'bucket:archive-662', type: 'storage', timestamp: '2026-09-15 12:17 UTC', severity: 'destructive' }
			]
		}
	}),
	funnel: spec({
		type: 'funnel',
		props: {
			title: 'Checkout steps, last 30 days',
			data: [
				{ label: 'Landed on home', value: 48210 },
				{ label: 'Opened a product', value: 22950 },
				{ label: 'Added to bag', value: 9876 },
				{ label: 'Started checkout', value: 6355 },
				{ label: 'Entered card', value: 3902 },
				{ label: 'Placed order', value: 3518 }
			]
		}
	}),
	kanban: spec({
		type: 'kanban',
		props: {
			columns: [
				{ id: 'todo', title: 'To do' },
				{ id: 'doing', title: 'In progress', color: 'amber' },
				{ id: 'review', title: 'In review', color: 'blue' },
				{ id: 'done', title: 'Done', color: 'green' }
			],
			columnKey: 'status',
			titleKey: 'title',
			descriptionKey: 'description',
			badgeKey: 'owner',
			value: [
				{ id: 1, title: 'Ship loyalty points page', status: 'todo', owner: 'Marco' },
				{ id: 2, title: 'Draft delivery estimate badge', status: 'todo', owner: 'Priya', description: 'Show the window, not a single day.' },
				{ id: 3, title: 'Update gift card balance check', status: 'todo', owner: 'Lea' },
				{ id: 4, title: 'Design partner sign-up form', status: 'doing', owner: 'Lea', description: 'Two steps max, tax ID moves to step two.' },
				{ id: 5, title: 'Migrate warehouse label printer', status: 'doing', owner: 'Sam' },
				{ id: 6, title: 'Draft returns flow', status: 'doing', owner: 'Ana', description: 'Waiting on the refund policy copy.' },
				{ id: 7, title: 'Rewrite checkout copy', status: 'review', owner: 'Ana' },
				{ id: 8, title: 'Order history filters', status: 'review', owner: 'Sam', description: 'Date range and status, saved per user.' },
				{ id: 9, title: 'Help center search', status: 'done', owner: 'Priya' },
				{ id: 10, title: 'Weekly digest email', status: 'done', owner: 'Jon' },
				{ id: 11, title: 'Store hours widget', status: 'done', owner: 'Jon' }
			]
		}
	}),
	'menu-order': spec({
		type: 'menu-order',
		props: {
			title: 'Copper Griddle',
			subtitle: 'Open until 10 pm · Elm Street',
			currency: 'USD',
			featured: { id: 'mushroom-swiss', reason: 'Vegetarian and under $13.' },
			checkout: true,
			fulfilment: ['pickup', 'delivery'],
			fee: { delivery: 3.99 },
			preset: [{ id: 'shoestring-fries', qty: 1 }],
			items: [
				{
					product_id: 'smash-burger',
					name: 'Double Smash Burger',
					kind: 'main',
					category: 'Burgers',
					price: 13.5,
					description: 'Two smashed beef patties, American cheese, pickles and house sauce on a potato bun.',
					tags: ['Most ordered'],
					groups: [
						{
							id: 'size',
							name: 'Size',
							choose: 'one',
							required: true,
							options: [
								{ id: 'single', name: 'Single patty', price_delta: 0 },
								{ id: 'double', name: 'Double patty', price_delta: 2.5 }
							]
						},
						{
							id: 'extras',
							name: 'Extras',
							choose: 'many',
							max: 3,
							options: [
								{ id: 'bacon', name: 'Thick-cut bacon', price_delta: 2 },
								{ id: 'egg', name: 'Fried egg', price_delta: 1.25 },
								{ id: 'extra-cheese', name: 'Extra cheese', price_delta: 1 }
							]
						}
					]
				},
				{
					product_id: 'mushroom-swiss',
					name: 'Mushroom Swiss',
					kind: 'main',
					category: 'Burgers',
					price: 12.25,
					description: 'Roasted portobello, Swiss and caramelised onions.',
					tags: ['Vegetarian'],
					groups: [
						{
							id: 'size',
							name: 'Size',
							choose: 'one',
							required: true,
							options: [
								{ id: 'single', name: 'Single patty', price_delta: 0 },
								{ id: 'double', name: 'Double patty', price_delta: 2.5 }
							]
						}
					]
				},
				{ product_id: 'shoestring-fries', name: 'Shoestring Fries', kind: 'side', category: 'Sides', price: 3.95, description: 'Sea salt and rosemary.', tags: ['Vegan'] },
				{ product_id: 'malted-shake', name: 'Malted Vanilla Shake', kind: 'dessert', category: 'Shakes', price: 5.95, description: 'Thick, with a malt crumb.' }
			]
		}
	}),
	'saved-views': spec({
		type: 'saved-views',
		props: {
			value: 'mine',
			canCreate: true,
			views: [
				{ id: 'all', label: 'All tasks', icon: 'list', count: 412, pinned: true },
				{ id: 'mine', label: 'My tasks', icon: 'user', count: 17, pinned: true },
				{ id: 'today', label: 'Due today', icon: 'calendar', count: 6 },
				{ id: 'week', label: 'This week', count: 29 },
				{ id: 'overdue', label: 'Overdue', icon: 'alert-triangle', count: 11 },
				{ id: 'review', label: 'In review', count: 9 },
				{ id: 'blocked', label: 'Blocked', icon: 'ban', count: 4 },
				{ id: 'unassigned', label: 'Unassigned', count: 15 },
				{ id: 'recent', label: 'Recently updated', icon: 'history', count: 88 },
				{ id: 'done', label: 'Done', icon: 'check', count: 1306 }
			]
		}
	}),
	gauge: spec({
		type: 'gauge',
		props: { title: 'Seed round', value: 182000, max: 250000, currency: 'USD', label: 'Raised so far' }
	}),
	'order-status': spec({
		type: 'order-status',
		props: {
			orderId: 'B7C2E91A',
			title: 'On the way',
			steps: [
				{ id: 'confirmed', label: 'Confirmed', completedAt: '18 min ago' },
				{ id: 'preparing', label: 'Preparing', completedAt: '9 min ago' },
				{ id: 'out-for-delivery', label: 'On the way', completedAt: 'just now' },
				{ id: 'delivered', label: 'Delivered' }
			],
			currentStep: 'out-for-delivery',
			eta: '12 min',
			origin: { name: 'Copper Griddle kitchen', lat: 37.7764, lng: -122.4172 },
			destination: { name: 'Drop-off', lat: 37.788, lng: -122.401 },
			tracker: { lat: 37.7815, lng: -122.4101, label: 'Courier' },
			route: [
				[37.7764, -122.4172],
				[37.779, -122.414],
				[37.7815, -122.4101],
				[37.784, -122.4068],
				[37.7862, -122.404],
				[37.788, -122.401]
			],
			events: [
				{ time: 'just now', label: 'Courier picked up your order' },
				{ time: '9 min ago', label: 'Kitchen started preparing' },
				{ time: '18 min ago', label: 'Order confirmed' }
			],
			mapTiles: 'osm'
		}
	}),
	'org-chart': spec({
		type: 'org-chart',
		props: {
			value: 'h2-3',
			root: {
				id: 'ceo',
				name: 'Rosa Alvarez',
				title: 'Chief Executive Officer',
				children: [
					{
						id: 'h1',
						name: 'Amara Okafor',
						title: 'Head of Design',
						children: [
							{ id: 'h1-1', name: 'Bruno Ferreira', title: 'Product Designer' },
							{ id: 'h1-2', name: 'Chloe Dubois', title: 'Product Designer' },
							{ id: 'h1-3', name: 'Dmitri Volkov', title: 'Brand Designer' },
							{ id: 'h1-4', name: 'Elena Rossi', title: 'Design Researcher' }
						]
					},
					{
						id: 'h2',
						name: 'Farid Rahimi',
						title: 'Head of Engineering',
						children: [
							{ id: 'h2-1', name: 'Grace Liu', title: 'Frontend Engineer' },
							{ id: 'h2-2', name: 'Hugo Lindqvist', title: 'Backend Engineer' },
							{ id: 'h2-3', name: 'Ines Moreau', title: 'Backend Engineer' },
							{ id: 'h2-4', name: 'Jonas Becker', title: 'Mobile Engineer' },
							{ id: 'h2-5', name: 'Kavya Iyer', title: 'Site Reliability Engineer' }
						]
					},
					{
						id: 'h3',
						name: "Liam O'Connell",
						title: 'Head of Growth',
						children: [
							{ id: 'h3-1', name: 'Mei Tanaka', title: 'Lifecycle Marketer' },
							{ id: 'h3-2', name: 'Nikolai Petrov', title: 'Content Lead' },
							{ id: 'h3-3', name: 'Olivia Grant', title: 'Partnerships Manager' }
						]
					}
				]
			}
		}
	}),
	'pipeline-dashboard': spec({
		type: 'pipeline-dashboard',
		props: {
			title: 'Hiring pipeline',
			subtitle: 'Engineering and design roles',
			period: 'H2 2026',
			quota: { label: 'Hires', current: 14, target: 20, period: 'H2 hiring plan, 11 weeks left' },
			conversion: [
				{ from: 'Applied', to: 'Screened', rate: 22.5 },
				{ from: 'Screened', to: 'Onsite', rate: 41.1 },
				{ from: 'Onsite', to: 'Offer', rate: 28.3 },
				{ from: 'Offer', to: 'Accepted', rate: 82.4 }
			],
			leaderboard: {
				title: 'Top referrers',
				items: [
					{ name: 'Sunniva Halvorsen', value: 6, sublabel: '2 hired' },
					{ name: 'Kofi Mensah', value: 4, sublabel: '1 hired' },
					{ name: 'Lucia Ferreira', value: 3 },
					{ name: 'Arjun Mehta', value: 3, sublabel: '1 hired' }
				]
			},
			deals: {
				title: 'Candidates in final rounds',
				columns: [
					{ key: 'name', label: 'Candidate' },
					{ key: 'role', label: 'Role' },
					{ key: 'stage', label: 'Stage' },
					{ key: 'days', label: 'Days in stage', align: 'right' }
				],
				rows: [
					{ name: 'Noor Haddad', role: 'Staff engineer', stage: 'Offer', days: 2 },
					{ name: 'Emil Sandberg', role: 'Product designer', stage: 'Onsite', days: 5 },
					{ name: 'Thandiwe Nkosi', role: 'Engineering manager', stage: 'Onsite', days: 9 },
					{ name: 'Mateo Rinaldi', role: 'Data engineer', stage: 'Reference check', days: 1 }
				]
			},
			ticker: [
				{ time: '10m ago', label: 'Offer accepted: Platform engineer', actor: 'Kofi Mensah', icon: 'check-circle-2' },
				{ time: '2h ago', label: 'Onsite scheduled: Emil Sandberg', actor: 'Lucia Ferreira', icon: 'calendar' },
				{ time: 'Yesterday', label: 'Candidate withdrew: Backend engineer', icon: 'x-circle' }
			]
		}
	}),
	sankey: spec({
		type: 'sankey',
		props: {
			title: 'Support tickets this month',
			nodes: [
				{ name: 'Email' },
				{ name: 'Chat' },
				{ name: 'Phone' },
				{ name: 'Web form' },
				{ name: 'Community' },
				{ name: 'Self-serve' },
				{ name: 'Triage' },
				{ name: 'Billing' },
				{ name: 'Technical' },
				{ name: 'Account' },
				{ name: 'Feedback' },
				{ name: 'Resolved' },
				{ name: 'Escalated' },
				{ name: 'Open' }
			],
			links: [
				{ source: 'Email', target: 'Triage', value: 420 },
				{ source: 'Chat', target: 'Triage', value: 610 },
				{ source: 'Chat', target: 'Self-serve', value: 140 },
				{ source: 'Phone', target: 'Triage', value: 180 },
				{ source: 'Web form', target: 'Triage', value: 260 },
				{ source: 'Community', target: 'Triage', value: 45 },
				{ source: 'Triage', target: 'Billing', value: 380 },
				{ source: 'Triage', target: 'Technical', value: 640 },
				{ source: 'Triage', target: 'Account', value: 290 },
				{ source: 'Triage', target: 'Feedback', value: 160 },
				{ source: 'Billing', target: 'Resolved', value: 350 },
				{ source: 'Billing', target: 'Escalated', value: 30 },
				{ source: 'Technical', target: 'Resolved', value: 510 },
				{ source: 'Technical', target: 'Escalated', value: 95 },
				{ source: 'Technical', target: 'Open', value: 35 },
				{ source: 'Account', target: 'Resolved', value: 270 },
				{ source: 'Account', target: 'Open', value: 20 },
				{ source: 'Feedback', target: 'Resolved', value: 60 }
			]
		}
	}),
	'sources-bar': spec({
		type: 'sources-bar',
		props: {
			sources: [
				{ name: 'Kestrel Analytics', url: 'https://example.com/kestrel/q3' },
				{ name: 'Oakmere Reports', url: 'https://example.com/oakmere/q3' },
				{ name: 'Rivergate Wire', url: 'https://example.com/rivergate/q3' },
				{ name: 'Saltmarsh Quarterly', url: 'https://example.com/saltmarsh/q3' },
				{ name: 'Copperline Data', url: 'https://example.com/copperline/q3' }
			],
			count: 48,
			label: 'pages read',
			share: true,
			copy: true
		}
	}),

	// ── Wave 4: travel, food, weather, money and study ───────────────────
	itinerary: spec(
		{
			type: 'itinerary',
			bind: '{state.days}',
			props: {
				title: 'A week island hopping',
				subtitle: '12 to 18 July · 2 travellers',
				verdict: { text: 'About €120 over budget; the Santorini sailing trip is the biggest single cost.', status: 'warn' },
				currency: 'EUR',
				budget: 900,
				open: 4,
				route: ['Athens', 'Piraeus', 'Naxos', 'Paros', 'Santorini', 'Heraklion', 'Chania', 'Athens'],
				legs: [
					{ id: 'l1', from: 'Athens', to: 'Piraeus', kind: 'bus', ref: 'X96', minutes: 50, cost: 6 },
					{ id: 'l2', from: 'Piraeus', to: 'Naxos', kind: 'ferry', ref: 'Blue line 07:25', minutes: 300, cost: 45 },
					{ id: 'l3', from: 'Naxos', to: 'Paros', kind: 'ferry', minutes: 45, cost: 32 },
					{ id: 'l4', from: 'Paros', to: 'Santorini', kind: 'ferry', minutes: 120, cost: 38 },
					{ id: 'l5', from: 'Santorini', to: 'Heraklion', kind: 'flight', ref: 'AX 214', minutes: 40, cost: 89 },
					{ id: 'l6', from: 'Heraklion', to: 'Chania', kind: 'car', ref: 'Rental, one way', minutes: 165, cost: 60 },
					{ id: 'l7', from: 'Chania', to: 'Athens', kind: 'flight', ref: 'AX 331', minutes: 50, cost: 95 }
				],
				days: '{state.days}',
				packing: [
					{ group: 'Documents', items: ['Passports', 'Ferry e-tickets', 'Driving licence'] },
					{ group: 'Beach', items: ['Swimsuits', 'Reef-safe sunscreen', 'Snorkel mask', 'Quick-dry towel'] },
					{ group: 'Hiking', items: ['Trail shoes', '2 L water each', 'Sun hat'] }
				]
			}
		},
		{
			days: [
				{
					id: 'd1',
					label: 'Day 1',
					when: 'Mon 12 Jul',
					theme: 'Arrive and climb to the old town',
					stay: 'Pension Lykavitos, Plaka',
					stops: [
						{
							id: 'd1s1',
							time: '13:00',
							title: 'Airport metro into the centre',
							kind: 'transit',
							minutes: 45,
							cost: 9
						},
						{
							id: 'd1s2',
							time: '15:00',
							title: 'Acropolis hill and museum',
							kind: 'sight',
							place: 'Makrygianni',
							minutes: 180,
							cost: 30,
							must: true
						},
						{ id: 'd1s3', time: '19:00', title: 'Sunset from Filopappou hill', kind: 'nature', minutes: 45, cost: 0 },
						{
							id: 'd1s4',
							time: '20:30',
							title: 'Taverna dinner in Plaka',
							kind: 'food',
							place: 'Plaka',
							minutes: 90,
							cost: 38
						}
					]
				},
				{
					id: 'd2',
					label: 'Day 2',
					when: 'Tue 13 Jul',
					theme: 'Ferry to Naxos',
					stay: 'Studio Portara, Chora',
					stops: [
						{
							id: 'd2s1',
							time: '07:25',
							title: 'Morning ferry from Piraeus',
							kind: 'transit',
							place: 'Piraeus',
							minutes: 300,
							cost: 0
						},
						{
							id: 'd2s2',
							time: '14:00',
							title: 'Portara gate at the harbour',
							kind: 'sight',
							place: 'Chora',
							minutes: 40,
							cost: 0,
							must: true
						},
						{ id: 'd2s3', time: '16:00', title: 'Swim at Agios Prokopios', kind: 'nature', minutes: 120, cost: 0 },
						{
							id: 'd2s4',
							time: '20:00',
							title: 'Grilled octopus at the harbour',
							kind: 'food',
							minutes: 75,
							cost: 34
						}
					]
				},
				{
					id: 'd3',
					label: 'Day 3',
					when: 'Wed 14 Jul',
					theme: 'Naxos villages by car',
					stay: 'Studio Portara, Chora',
					stops: [
						{ id: 'd3s1', time: '09:00', title: 'Pick up the rental car', kind: 'transit', cost: 0 },
						{
							id: 'd3s2',
							time: '10:00',
							title: 'Halki village and the citron distillery',
							kind: 'shop',
							place: 'Halki',
							minutes: 90,
							cost: 18
						},
						{
							id: 'd3s3',
							time: '12:30',
							title: 'Lunch in Apiranthos',
							kind: 'food',
							place: 'Apiranthos',
							minutes: 75,
							cost: 26
						},
						{
							id: 'd3s4',
							time: '15:00',
							title: 'Kouros statue in the hills',
							kind: 'sight',
							place: 'Melanes',
							minutes: 45,
							cost: 0
						},
						{ id: 'd3s5', time: '18:00', title: 'Plaka beach sunset', kind: 'nature', minutes: 90, cost: 0 },
						{
							id: 'd3s6',
							time: '21:30',
							title: 'Cocktails in the old market',
							kind: 'nightlife',
							place: 'Chora',
							minutes: 90,
							cost: 24
						}
					]
				},
				{
					id: 'd4',
					label: 'Day 4',
					when: 'Thu 15 Jul',
					theme: 'Paros and Naoussa harbour',
					stay: 'Kamares rooms, Naoussa',
					stops: [
						{ id: 'd4s1', time: '10:15', title: 'Fast ferry to Paros', kind: 'transit', minutes: 45, cost: 0 },
						{
							id: 'd4s2',
							time: '12:00',
							title: 'Church of a Hundred Doors',
							kind: 'sight',
							place: 'Parikia',
							minutes: 45,
							cost: 3
						},
						{ id: 'd4s3', time: '14:00', title: 'Kolymbithres rock beach', kind: 'nature', minutes: 150, cost: 12 },
						{
							id: 'd4s4',
							time: '20:00',
							title: 'Seafood on the Naoussa quay',
							kind: 'food',
							place: 'Naoussa',
							minutes: 90,
							cost: 52
						}
					]
				},
				{
					id: 'd5',
					label: 'Day 5',
					when: 'Fri 16 Jul',
					theme: 'Santorini caldera',
					stay: 'Cave house Ilios, Oia',
					stops: [
						{ id: 'd5s1', time: '09:30', title: 'Ferry to Santorini', kind: 'transit', minutes: 120, cost: 0 },
						{
							id: 'd5s2',
							time: '13:00',
							title: 'Akrotiri excavations',
							kind: 'sight',
							place: 'Akrotiri',
							minutes: 90,
							cost: 20,
							must: true
						},
						{
							id: 'd5s3',
							time: '16:00',
							title: 'Caldera sailing trip',
							kind: 'activity',
							minutes: 300,
							cost: 140,
							must: true
						},
						{
							id: 'd5s4',
							time: '21:30',
							title: 'Late dinner in Oia',
							kind: 'food',
							place: 'Oia',
							minutes: 90,
							cost: 70
						}
					]
				},
				{
					id: 'd6',
					label: 'Day 6',
					when: 'Sat 17 Jul',
					theme: 'Crete: Heraklion to Chania',
					stay: 'Harbour loft, Chania',
					stops: [
						{ id: 'd6s1', time: '08:00', title: 'Flight to Heraklion', kind: 'flight', minutes: 40, cost: 0 },
						{
							id: 'd6s2',
							time: '10:00',
							title: 'Knossos palace',
							kind: 'sight',
							place: 'Knossos',
							minutes: 150,
							cost: 20,
							must: true
						},
						{ id: 'd6s3', time: '14:00', title: 'Coach west to Chania', kind: 'transit', minutes: 165, cost: 0 },
						{
							id: 'd6s4',
							time: '19:30',
							title: 'Venetian harbour walk',
							kind: 'sight',
							place: 'Chania',
							minutes: 60,
							cost: 0
						},
						{
							id: 'd6s5',
							time: '21:00',
							title: 'Cretan tasting menu',
							kind: 'food',
							place: 'Chania',
							minutes: 120,
							cost: 65
						}
					]
				},
				{
					id: 'd7',
					label: 'Day 7',
					when: 'Sun 18 Jul',
					theme: 'Gorge hike and fly home',
					stops: [
						{
							id: 'd7s1',
							time: '06:30',
							title: 'Samaria gorge day tour',
							kind: 'nature',
							minutes: 600,
							cost: 55,
							must: true
						},
						{
							id: 'd7s2',
							time: '18:30',
							title: 'Souvenir market',
							kind: 'shop',
							place: 'Chania',
							minutes: 45,
							cost: 40
						},
						{ id: 'd7s3', time: '21:40', title: 'Flight back to Athens', kind: 'flight', minutes: 50, cost: 0 }
					]
				}
			]
		}
	),
	'meal-plan': spec(
		{
			type: 'meal-plan',
			props: {
				title: 'High-protein week',
				subtitle: '7 days of simple, high-protein meals. Swap any meal and the shopping list follows.',
				verdict: {
					text: 'About 150 g protein per person a day, past the 140 g goal; calories run a little under 2,200.',
					status: 'good'
				},
				people: '{state.people}',
				goal: { protein_g: 140, kcal: 2200 },
				recipes: [
					{
						id: 'oats',
						name: 'Protein overnight oats',
						kind: 'breakfast',
						serves: 1,
						minutes: 5,
						kcal: 480,
						protein_g: 35,
						ingredients: [
							{ name: 'rolled oats', qty: 0.5, unit: 'cup', aisle: 'grains' },
							{ name: 'Greek yogurt', qty: 0.75, unit: 'cup', aisle: 'dairy' },
							{ name: 'protein powder', qty: 1, unit: 'scoop', aisle: 'pantry' },
							{ name: 'blueberries', qty: 0.5, unit: 'cup', aisle: 'produce' }
						]
					},
					{
						id: 'eggs',
						name: 'Spinach egg scramble',
						kind: 'breakfast',
						serves: 1,
						minutes: 10,
						kcal: 420,
						protein_g: 32,
						ingredients: [
							{ name: 'eggs', qty: 4, aisle: 'dairy' },
							{ name: 'baby spinach', qty: 2, unit: 'cup', aisle: 'produce' },
							{ name: 'feta', qty: 0.25, unit: 'cup', aisle: 'dairy' }
						]
					},
					{
						id: 'cottage',
						name: 'Cottage cheese power bowl',
						kind: 'breakfast',
						serves: 1,
						minutes: 5,
						kcal: 390,
						protein_g: 34,
						ingredients: [
							{ name: 'cottage cheese', qty: 1, unit: 'cup', aisle: 'dairy' },
							{ name: 'pineapple chunks', qty: 0.5, unit: 'cup', aisle: 'produce' },
							{ name: 'chia seeds', qty: 1, unit: 'tbsp', aisle: 'pantry' }
						]
					},
					{
						id: 'chicken-bowl',
						name: 'Chicken rice bowl',
						kind: 'lunch',
						serves: 2,
						minutes: 30,
						kcal: 640,
						protein_g: 52,
						ingredients: [
							{ name: 'chicken breast', qty: 500, unit: 'g', aisle: 'protein' },
							{ name: 'jasmine rice', qty: 1, unit: 'cup', aisle: 'grains' },
							{ name: 'broccoli', qty: 2, unit: 'cup', aisle: 'produce' },
							{ name: 'soy sauce', qty: 2, unit: 'tbsp', aisle: 'pantry' }
						]
					},
					{
						id: 'tuna-wrap',
						name: 'Tuna and white bean wrap',
						kind: 'lunch',
						serves: 2,
						minutes: 10,
						kcal: 540,
						protein_g: 44,
						ingredients: [
							{ name: 'canned tuna', qty: 2, unit: 'can', aisle: 'pantry' },
							{ name: 'white beans', qty: 1, unit: 'can', aisle: 'pantry' },
							{ name: 'whole-wheat wraps', qty: 2, aisle: 'grains' },
							{ name: 'arugula', qty: 2, unit: 'cup', aisle: 'produce' }
						]
					},
					{
						id: 'turkey-salad',
						name: 'Turkey and quinoa salad',
						kind: 'lunch',
						serves: 2,
						minutes: 20,
						kcal: 560,
						protein_g: 46,
						ingredients: [
							{ name: 'turkey breast slices', qty: 300, unit: 'g', aisle: 'protein' },
							{ name: 'quinoa', qty: 0.75, unit: 'cup', aisle: 'grains' },
							{ name: 'cucumber', qty: 1, aisle: 'produce' },
							{ name: 'cherry tomatoes', qty: 1, unit: 'cup', aisle: 'produce' }
						]
					},
					{
						id: 'salmon',
						name: 'Salmon, quinoa and greens',
						kind: 'dinner',
						serves: 2,
						minutes: 25,
						kcal: 690,
						protein_g: 48,
						ingredients: [
							{ name: 'salmon fillet', qty: 400, unit: 'g', aisle: 'protein' },
							{ name: 'quinoa', qty: 0.75, unit: 'cup', aisle: 'grains' },
							{ name: 'green beans', qty: 2, unit: 'cup', aisle: 'produce' },
							{ name: 'lemon', qty: 1, aisle: 'produce' }
						]
					},
					{
						id: 'chili',
						name: 'Turkey bean chili',
						kind: 'dinner',
						serves: 4,
						minutes: 40,
						kcal: 560,
						protein_g: 46,
						ingredients: [
							{ name: 'ground turkey', qty: 500, unit: 'g', aisle: 'protein' },
							{ name: 'black beans', qty: 2, unit: 'can', aisle: 'pantry' },
							{ name: 'crushed tomatoes', qty: 1, unit: 'can', aisle: 'pantry' },
							{ name: 'onion', qty: 1, aisle: 'produce' }
						]
					},
					{
						id: 'steak',
						name: 'Sirloin steak with sweet potato',
						kind: 'dinner',
						serves: 2,
						minutes: 30,
						kcal: 680,
						protein_g: 50,
						ingredients: [
							{ name: 'sirloin steak', qty: 450, unit: 'g', aisle: 'protein' },
							{ name: 'sweet potato', qty: 2, aisle: 'produce' },
							{ name: 'asparagus', qty: 1, unit: 'bunch', aisle: 'produce' }
						]
					},
					{
						id: 'shrimp',
						name: 'Garlic shrimp stir-fry',
						kind: 'dinner',
						serves: 2,
						minutes: 20,
						kcal: 520,
						protein_g: 42,
						ingredients: [
							{ name: 'shrimp', qty: 450, unit: 'g', aisle: 'protein' },
							{ name: 'bell pepper', qty: 2, aisle: 'produce' },
							{ name: 'jasmine rice', qty: 0.75, unit: 'cup', aisle: 'grains' },
							{ name: 'garlic', qty: 3, unit: 'clove', aisle: 'produce' }
						]
					},
					{
						id: 'shake',
						name: 'Greek yogurt and almond snack',
						kind: 'snack',
						serves: 1,
						minutes: 2,
						kcal: 250,
						protein_g: 22,
						ingredients: [
							{ name: 'Greek yogurt', qty: 1, unit: 'cup', aisle: 'dairy' },
							{ name: 'almonds', qty: 2, unit: 'tbsp', aisle: 'pantry' }
						]
					},
					{
						id: 'edamame',
						name: 'Edamame and jerky',
						kind: 'snack',
						serves: 1,
						minutes: 5,
						kcal: 230,
						protein_g: 24,
						ingredients: [
							{ name: 'edamame', qty: 1, unit: 'cup', aisle: 'frozen' },
							{ name: 'beef jerky', qty: 30, unit: 'g', aisle: 'protein' }
						]
					}
				],
				days: [
					{
						day: 'Mon',
						meals: [
							{ slot: 'breakfast', recipe: 'oats' },
							{ slot: 'lunch', recipe: 'chicken-bowl' },
							{ slot: 'dinner', recipe: 'salmon' },
							{ slot: 'snack', recipe: 'shake' }
						]
					},
					{
						day: 'Tue',
						meals: [
							{ slot: 'breakfast', recipe: 'eggs' },
							{ slot: 'lunch', recipe: 'tuna-wrap' },
							{ slot: 'dinner', recipe: 'chili' },
							{ slot: 'snack', recipe: 'edamame' }
						]
					},
					{
						day: 'Wed',
						meals: [
							{ slot: 'breakfast', recipe: 'cottage' },
							{ slot: 'lunch', recipe: 'turkey-salad' },
							{ slot: 'dinner', recipe: 'steak' },
							{ slot: 'snack', recipe: 'shake' }
						]
					},
					{
						day: 'Thu',
						meals: [
							{ slot: 'breakfast', recipe: 'oats' },
							{ slot: 'lunch', recipe: 'chicken-bowl' },
							{ slot: 'dinner', recipe: 'shrimp' },
							{ slot: 'snack', recipe: 'edamame' }
						]
					},
					{
						day: 'Fri',
						meals: [
							{ slot: 'breakfast', recipe: 'eggs' },
							{ slot: 'lunch', recipe: 'tuna-wrap' },
							{ slot: 'dinner', recipe: 'chili' },
							{ slot: 'snack', recipe: 'shake' }
						]
					},
					{
						day: 'Sat',
						meals: [
							{ slot: 'breakfast', recipe: 'cottage' },
							{ slot: 'lunch', recipe: 'turkey-salad' },
							{ slot: 'dinner', recipe: 'salmon' },
							{ slot: 'snack', recipe: 'edamame' }
						]
					},
					{
						day: 'Sun',
						meals: [
							{ slot: 'breakfast', recipe: 'oats' },
							{ slot: 'lunch', recipe: 'chicken-bowl' },
							{ slot: 'dinner', recipe: 'steak' },
							{ slot: 'snack', recipe: 'shake' }
						]
					}
				]
			},
			bind: '{state.people}'
		},
		{ people: 2 }
	),
	'weather-forecast': spec({
		type: 'weather-forecast',
		props: {
			place: 'Frostvik Station',
			unit: 'C',
			note: 'Sample forecast',
			now: { temp: -27, condition: 'night-clear', feelsLike: -38, humidity: 71, wind: '31 km/h N' },
			hourly: [
				{ time: '21:00', temp: -27, condition: 'night-clear' },
				{ time: '22:00', temp: -28, condition: 'night-clear' },
				{ time: '23:00', temp: -29, condition: 'fog' },
				{ time: '00:00', temp: -30, condition: 'fog' },
				{ time: '01:00', temp: -31, condition: 'snow' },
				{ time: '02:00', temp: -31, condition: 'wind' }
			],
			days: [
				{ day: 'Mon', condition: 'night-clear', high: -18, low: -31 },
				{ day: 'Tue', condition: 'snow', high: -12, low: -24, rainChance: 90 },
				{ day: 'Wed', condition: 'wind', high: -9, low: -20 },
				{ day: 'Thu', condition: 'fog', high: -4, low: -11, rainChance: 20 },
				{ day: 'Fri', condition: 'cloudy', high: 0, low: -6 },
				{ day: 'Sat', condition: 'rain', high: 3, low: -1, rainChance: 60 },
				{ day: 'Sun', condition: 'heavy-rain', high: 2, low: -2, rainChance: 95 },
				{ day: 'Mon', condition: 'thunder', high: 4, low: 1, rainChance: 70 },
				{ day: 'Tue', condition: 'partly-cloudy', high: -3, low: -10 },
				{ day: 'Wed', condition: 'sunny', high: -8, low: -19 }
			]
		}
	}),
	'bill-split': spec(
		{
			type: 'bill-split',
			bind: '{state.bill}',
			props: {
				title: 'Team dinner after the launch',
				currency: 'EUR',
				subtotal: 1486.5,
				tax: 133.79,
				tip_percent: 10,
				tip_options: [5, 10, 15],
				extras_label: 'Wine',
				people: [
					{ id: 'p1', name: 'Mara', extras: 18 },
					{ id: 'p2', name: 'Theo', extras: 0 },
					{ id: 'p3', name: 'Ines', extras: 24.5 },
					{ id: 'p4', name: 'Bao', extras: 0 },
					{ id: 'p5', name: 'Lucia', extras: 9 },
					{ id: 'p6', name: 'Femi', extras: 0 },
					{ id: 'p7', name: 'Oskar', extras: 31 },
					{ id: 'p8', name: 'Yuki', extras: 0 },
					{ id: 'p9', name: 'Ravi', extras: 0 },
					{ id: 'p10', name: 'Noor', extras: 12 },
					{ id: 'p11', name: 'Elsa', extras: 0 },
					{ id: 'p12', name: 'Tomas', extras: 6.5 }
				],
				note: 'Tip on the food and wine before tax.'
			}
		},
		{ bill: null }
	),
	quiz: spec(
		{
			type: 'quiz',
			bind: '{state.quiz}',
			props: {
				title: 'Solar system lightning round',
				topic: 'Astronomy',
				seconds_per_question: 15,
				shuffle_choices: true,
				questions: [
					{
						id: 'q1',
						prompt: 'Which planet is closest to the Sun?',
						choices: ['Venus', 'Mercury', 'Mars'],
						answer: 1,
						why: 'Mercury orbits at about 58 million km.'
					},
					{
						id: 'q2',
						prompt: 'How many moons does Mars have?',
						choices: ['None', 'One', 'Two', 'Four'],
						answer: 2,
						why: 'Phobos and Deimos, both small and lumpy.'
					},
					{
						id: 'q3',
						prompt: 'Which planet has the Great Red Spot?',
						choices: ['Saturn', 'Jupiter', 'Neptune', 'Uranus', 'Mars'],
						answer: 1,
						why: 'A storm wider than Earth that has lasted centuries.'
					},
					{
						id: 'q4',
						prompt: 'What is the Sun mostly made of?',
						choices: ['Hydrogen', 'Oxygen', 'Iron'],
						answer: 0,
						why: 'About three quarters of its mass is hydrogen.'
					},
					{
						id: 'q5',
						prompt: 'Which planet spins on its side?',
						choices: ['Uranus', 'Neptune', 'Saturn'],
						answer: 0,
						why: 'Uranus is tilted about 98 degrees.'
					},
					{
						id: 'q6',
						prompt: 'What is the largest moon of Saturn?',
						choices: ['Titan', 'Rhea', 'Enceladus', 'Iapetus'],
						answer: 0,
						why: 'Titan is bigger than the planet Mercury.'
					},
					{
						id: 'q7',
						prompt: 'Roughly how old is the Sun?',
						choices: ['4.6 million years', '460 million years', '4.6 billion years'],
						answer: 2,
						why: 'It formed about 4.6 billion years ago.'
					},
					{
						id: 'q8',
						prompt: 'Which planet has the most volcanoes we know of?',
						choices: ['Earth', 'Venus', 'Mars', 'Mercury', 'Jupiter'],
						answer: 1,
						why: 'Radar maps show over a thousand volcanic features.'
					},
					{
						id: 'q9',
						prompt: 'What is a light year?',
						choices: ['A unit of time', 'A unit of distance'],
						answer: 1,
						why: 'The distance light travels in one year.'
					},
					{
						id: 'q10',
						prompt: 'Which planet would float in a giant bathtub?',
						choices: ['Jupiter', 'Saturn', 'Neptune'],
						answer: 1,
						why: 'Saturn is less dense than water.'
					},
					{
						id: 'q11',
						prompt: 'Where is the asteroid belt?',
						choices: ['Between Mars and Jupiter', 'Between Earth and Mars', 'Past Neptune'],
						answer: 0,
						why: 'Most asteroids orbit between Mars and Jupiter.'
					},
					{
						id: 'q12',
						prompt: 'Which is the hottest planet?',
						choices: ['Mercury', 'Venus', 'Mars'],
						answer: 1,
						why: 'Its thick atmosphere traps heat, near 465 degrees C.'
					},
					{
						id: 'q13',
						prompt: 'Which planet has the longest year?',
						choices: ['Neptune', 'Uranus', 'Saturn'],
						answer: 0,
						why: 'One Neptune year is about 165 Earth years.'
					}
				]
			}
		},
		{ quiz: null }
	),
	'flashcard-deck': spec(
		{
			type: 'flashcard-deck',
			bind: '{state.score}',
			props: {
				title: 'Italian kitchen words',
				cards: [
					{ front: 'Spoon', back: 'Cucchiaio', category: 'Tableware' },
					{ front: 'Fork', back: 'Forchetta', category: 'Tableware' },
					{ front: 'Knife', back: 'Coltello', category: 'Tableware' },
					{ front: 'Plate', back: 'Piatto', category: 'Tableware' },
					{ front: 'Glass', back: 'Bicchiere', category: 'Tableware' },
					{ front: 'Cup', back: 'Tazza', category: 'Tableware' },
					{ front: 'Napkin', back: 'Tovagliolo', category: 'Tableware' },
					{ front: 'Bowl', back: 'Ciotola', category: 'Tableware' },
					{ front: 'Pot', back: 'Pentola', category: 'Cookware' },
					{ front: 'Pan', back: 'Padella', category: 'Cookware' },
					{ front: 'Lid', back: 'Coperchio', category: 'Cookware' },
					{ front: 'Colander', back: 'Scolapasta', category: 'Cookware', hint: 'Literally a pasta drainer' },
					{ front: 'Grater', back: 'Grattugia', category: 'Cookware' },
					{ front: 'Ladle', back: 'Mestolo', category: 'Cookware' },
					{ front: 'Whisk', back: 'Frusta', category: 'Cookware' },
					{ front: 'Cutting board', back: 'Tagliere', category: 'Cookware' },
					{ front: 'Oven', back: 'Forno', category: 'Appliances' },
					{ front: 'Stove', back: 'Fornello', category: 'Appliances' },
					{ front: 'Fridge', back: 'Frigorifero', category: 'Appliances' },
					{ front: 'Freezer', back: 'Congelatore', category: 'Appliances' },
					{ front: 'Dishwasher', back: 'Lavastoviglie', category: 'Appliances' },
					{ front: 'Kettle', back: 'Bollitore', category: 'Appliances' },
					{ front: 'Toaster', back: 'Tostapane', category: 'Appliances', hint: 'Toast, plus the word for bread' },
					{ front: 'Blender', back: 'Frullatore', category: 'Appliances' },
					{ front: 'Salt', back: 'Sale', category: 'Pantry' },
					{ front: 'Pepper', back: 'Pepe', category: 'Pantry' },
					{ front: 'Oil', back: 'Olio', category: 'Pantry' },
					{ front: 'Vinegar', back: 'Aceto', category: 'Pantry' },
					{ front: 'Flour', back: 'Farina', category: 'Pantry' },
					{ front: 'Sugar', back: 'Zucchero', category: 'Pantry' },
					{ front: 'Rice', back: 'Riso', category: 'Pantry' },
					{ front: 'Bread', back: 'Pane', category: 'Pantry' },
					{ front: 'To boil', back: 'Bollire', category: 'Verbs' },
					{ front: 'To fry', back: 'Friggere', category: 'Verbs' },
					{ front: 'To bake', back: 'Cuocere al forno', category: 'Verbs' },
					{ front: 'To chop', back: 'Tritare', category: 'Verbs' },
					{ front: 'To stir', back: 'Mescolare', category: 'Verbs' },
					{ front: 'To taste', back: 'Assaggiare', category: 'Verbs' },
					{ front: 'To peel', back: 'Sbucciare', category: 'Verbs' },
					{ front: 'To serve', back: 'Servire', category: 'Verbs' }
				],
				shuffle: true
			}
		},
		{ score: 0 }
	)
};
