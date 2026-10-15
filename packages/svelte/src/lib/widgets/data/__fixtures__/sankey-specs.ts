// Worst-case sankey specs (fictional flows) shared by the layout and component tests.
export const n = (...names: string[]) => names.map((name) => ({ name }));
export const SPEC01 = {
	nodes: n('Landing', 'Signup', 'Active', 'Churn'),
	links: [
		{ source: 'Landing', target: 'Signup', value: 120 },
		{ source: 'Signup', target: 'Active', value: 85 },
		{ source: 'Active', target: 'Churn', value: 15 }
	]
};
export const SPEC02 = {
	nodes: n('Email', 'Chat', 'Phone', 'Web form', 'Community', 'Self-serve', 'Triage', 'Billing', 'Technical', 'Account', 'Feedback', 'Resolved', 'Escalated', 'Open'),
	links: [
		['Email', 'Triage', 420], ['Chat', 'Triage', 610], ['Chat', 'Self-serve', 140], ['Phone', 'Triage', 180],
		['Web form', 'Triage', 260], ['Community', 'Triage', 45], ['Triage', 'Billing', 380], ['Triage', 'Technical', 640],
		['Triage', 'Account', 290], ['Triage', 'Feedback', 160], ['Billing', 'Resolved', 350], ['Billing', 'Escalated', 30],
		['Technical', 'Resolved', 510], ['Technical', 'Escalated', 95], ['Technical', 'Open', 35], ['Account', 'Resolved', 270],
		['Account', 'Open', 20], ['Feedback', 'Resolved', 60]
	].map(([source, target, value]) => ({ source, target, value }))
};
export const SPEC03 = {
	nodes: n("Subscription revenue from customers on annual enterprise plans", "Ads", "Operating budget", "Research and development including contractors, tooling and cloud infrastructure", "Ops", "Sales, marketing, partner programs and regional events across three continents", "G&A", "Cloud", "People", "IT"),
	links: [
		["Subscription revenue from customers on annual enterprise plans", "Operating budget", 820000],
		["Ads", "Operating budget", 90000],
		["Operating budget", "Research and development including contractors, tooling and cloud infrastructure", 380000],
		["Operating budget", "Ops", 120000],
		["Operating budget", "Sales, marketing, partner programs and regional events across three continents", 260000],
		["Operating budget", "G&A", 95000],
		["Research and development including contractors, tooling and cloud infrastructure", "Cloud", 140000],
		["Research and development including contractors, tooling and cloud infrastructure", "People", 240000],
		["G&A", "IT", 4000]
	].map(([source, target, value]) => ({ source, target, value }))
};
export const SPEC05 = {
	nodes: n("Referral", "Job board", "Careers page", "Applied", "Screened", "Not a fit", "Interview", "Withdrew", "Offer", "Not selected", "Hired", "Declined"),
	links: [
		["Referral", "Applied", 40],
		["Job board", "Applied", 310],
		["Careers page", "Applied", 150],
		["Applied", "Screened", 220],
		["Applied", "Not a fit", 280],
		["Screened", "Interview", 90],
		["Screened", "Withdrew", 25],
		["Interview", "Offer", 14],
		["Interview", "Not selected", 70],
		["Offer", "Hired", 11],
		["Offer", "Declined", 3]
	].map(([source, target, value]) => ({ source, target, value }))
};
export const SPEC04 = {
	nodes: ['Visit', { name: 'Search' }, { name: 'Cart' }, { name: 'Cart' }, { name: '' }, { name: 'Checkout' }, { name: 'Paid' }, { name: 'Orphan' }, { label: 'Promo' }],
	links: [
		{ source: 0, target: 1, value: 900 },
		{ source: 'Visit', target: 'Search', value: 100 },
		{ source: 'Visit', target: 'Cart', value: '1,200' },
		{ source: 'Search', target: 'Cart', value: '640' },
		{ source: 'Search', target: 'Wishlist', value: 120 },
		{ source: 'Cart', target: 'Cart', value: 50 },
		{ source: ' Cart ', target: 'Checkout', value: 1500 },
		{ source: 'Checkout', target: 'Cart', value: 200 },
		{ source: 'Checkout', target: 'Paid', value: 1100 },
		{ source: 'Paid', target: 'Receipt', value: 1300 },
		{ source: 'Paid', target: 'Refunded', value: -30 },
		{ source: 'Paid', target: 'Review', value: 0 },
		{ source: 'Paid', target: 'Survey' },
		{ source: 'Checkout', value: 40 },
		{ source: 'Paid', target: 'Receipt', value: 'lots' }
	]
};
export const SPEC06 = {
	nodes: n('Edge', 'Auth', 'API', 'Queue', 'Worker', 'Store', 'Index', 'Done', 'Blocked', 'Denied', 'Error', 'Dropped', 'Retry', 'Stale'),
	links: [
		['Edge', 'Auth', 99990], ['Edge', 'Blocked', 10], ['Auth', 'API', 99000], ['Auth', 'Denied', 990], ['API', 'Queue', 98000],
		['API', 'Error', 3], ['Queue', 'Worker', 97990], ['Queue', 'Dropped', 1], ['Worker', 'Store', 97000], ['Worker', 'Retry', 990],
		['Store', 'Index', 96000], ['Index', 'Done', 95500], ['Index', 'Stale', 2]
	].map(([source, target, value]) => ({ source, target, value }))
};
