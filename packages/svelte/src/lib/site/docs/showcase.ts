// site/docs/showcase.ts — Richer, site-only preview specs for widgets whose
// manifest `example` is too small to show them off. pageSpecs (widgets.ts)
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
//   calendar). Numbers add up (invoice lines sum to the subtotal, funnel
//   stages only shrink).

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
	})
};
