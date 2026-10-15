// site/docs/showcase.ts: site-only preview specs for widgets whose manifest
// `example` is too small to show them off, or points at media this site cannot
// load (example.com placeholders and third-party hosts the CSP in
// svelte.config.js blocks, links to pages the site lacks). Those use local
// files under static/ (media/, photos, /models assets) or hosts the CSP
// already allows. pageSpecs (widgets.ts)
// previews one of these in place of the manifest example when the type has an
// entry, so both /docs/widgets/<type> and /ds pick it up.
//
// Invariants:
// - Site only. The manifest example stays the canonical, minimal one: the
//   pocketpaw chat prompt reads the manifest and has no room for bigger ones,
//   and the .md / llms.txt output still prints the manifest example.
// - Every key is a manifest widget type and the spec root is that widget, so
//   the props configurator and variant rows keep targeting the root node.
//   showcase.test.ts checks both, and that each spec passes validateCatalog.
// - Fictional names and data only. Dates are not after the day this was
//   written (2026-10-14), except where the widget is about plans (gantt,
//   calendar). Numbers add up (invoice lines sum to the subtotal).

const spec = (ui: Record<string, unknown>): Record<string, unknown> => ({ version: '1.0', ui });

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
	// CSP-safe media: the manifest examples use example.com and other hosts the site blocks.
	avatar: spec({ type: 'avatar', props: { src: 'https://i.pravatar.cc/96?img=47', alt: 'Jane Doe', fallback: 'JD' } }),
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
	image: spec({
		type: 'image',
		props: {
			src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=70',
			alt: 'Scenic view',
			width: 200,
			height: 150,
			fit: 'cover',
			rounded: 'md'
		}
	}),
	video: spec({ type: 'video', props: { src: '/media/clip.mp4', poster: '/media/poster.jpg', title: 'Demo clip' } }),
	audio: spec({ type: 'audio', props: { src: '/media/track.mp3', title: 'Ambient loop', artist: 'Studio demo', showWaveform: true } }),
	'model-viewer': spec({
		type: 'model-viewer',
		props: {
			asset: 'astronaut',
			alt: 'A 3D model of an astronaut',
			cameraControls: true,
			annotations: [
				{ anchor: 'helmet', note: 'Holds air at a steady pressure.' },
				{ anchor: 'chest-pack' }
			]
		}
	}),
	// The site's CSP has frame-src 'none', so a remote page cannot load here; an inline document stands in.
	embed: spec({
		type: 'embed',
		props: {
			mode: 'srcdoc',
			title: 'Embedded video placeholder',
			aspectRatio: '16 / 9',
			srcdoc:
				'<!doctype html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b1d3a;color:#e8f0ff;font:15px system-ui,sans-serif;text-align:center"><div><div style="width:56px;height:56px;margin:0 auto 12px;border-radius:50%;background:#1877F2;display:grid;place-items:center;font-size:22px">&#9654;</div>This site blocks third-party frames,<br>so this inline document stands in for the video page.</div></body>'
		}
	}),
	// Links to pages this site has, so the example never leads to a 404.
	breadcrumb: spec({
		type: 'breadcrumb',
		props: {
			items: [
				{ label: 'Home', href: '/', icon: 'home' },
				{ label: 'Widgets', href: '/docs/widgets' },
				{ label: 'breadcrumb' }
			],
			separator: 'chevron'
		}
	})
};
