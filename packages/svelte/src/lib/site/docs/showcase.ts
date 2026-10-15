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
//   calendar). Numbers add up (invoice lines sum to the subtotal, funnel
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
		props: { title: 'Daily step goal', value: 4228, max: 10000, label: 'Steps today' }
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
	})
};
