// routes/live/scenarios.ts — The /live scenario registry, the fixture contract, and
// the landing's suggestion chips. Each fixture is a real model stream recorded
// offline by scripts/record-scenario.ts. Other tasks import these types and this
// list, so the shapes below are a contract: add fields, never rename or remove.
// `scenarios` are the landing's "Recorded runs" tiles (each needs a gallery
// thumb); `chatRecordings` are recordings of the widget demos and the
// playground example, chat only. `chatPrompts` are chips with no recording:
// live, they go to the chat (the `needsStore` ones only with a store); in replay
// mode they open Paw OS with their prompt, like typed text. `group` is the /live
// gallery's group; on the landing, `suggestionGroups` decides which group a chip
// sits in, its order, its lucide icon and (optionally) a shorter chip title; it
// names chips by id, and a chip whose topic has a recording uses the
// recording's id. `groupedSuggestions` resolves it against whatever chips are on
// offer, dropping missing ids, so a group with nothing available never renders.
// Prompts are visitor-facing: plain words, fictional products, no dashes.

import billSplitter from './fixtures/bill-splitter.json';
import savingsCalculator from './fixtures/savings-calculator.json';
import tokyoTrip from './fixtures/tokyo-trip.json';
import salesDashboard from './fixtures/sales-dashboard.json';
import flashcards from './fixtures/flashcards.json';
import heartPump from './fixtures/heart-pump.json';
import hiitWorkout from './fixtures/hiit-workout.json';
import mealPlan from './fixtures/meal-plan.json';
import bikeGears from './fixtures/bike-gears.json';
import plane3d from './fixtures/plane-3d.json';
import refundApproval from './fixtures/refund-approval.json';
import incidentRollback from './fixtures/incident-rollback.json';
import returnExchange from './fixtures/return-exchange.json';
import bookAppointment from './fixtures/book-appointment.json';
import quoteBuilder from './fixtures/quote-builder.json';
import appointment from './fixtures/appointment.json';
import cafeMenu from './fixtures/cafe-menu.json';
import compareTech from './fixtures/compare-tech.json';
import findRecipe from './fixtures/find-recipe.json';
import trackOrder from './fixtures/track-order.json';
import missionControl from './fixtures/mission-control.json';
import companySnapshot from './fixtures/company-snapshot.json';
import newsletterSignup from './fixtures/newsletter-signup.json';
import helloCard from './fixtures/hello-card.json';

export interface ScenarioFixture {
	id: string;
	title: string;
	prompt: string;
	/** What the model already knew when it drew (tool results, a shop's slots), from the recorder's --context. */
	context?: string;
	model: string;
	/** ISO timestamp of the recording. */
	recordedAt: string;
	/** Text deltas in arrival order; `t` is ms since the first chunk. */
	chunks: { t: number; text: string }[];
}

export interface Scenario {
	id: string;
	title: string;
	category: string;
	fixture: ScenarioFixture;
	/** True when the finished UI calls the host's store actions. */
	needsStore?: boolean;
	/** The hero chip's prompt for the live chat, when it differs from the recording's. */
	prompt?: string;
	/** The answer walks the visitor through steps (the chip says "step by step"). */
	steps?: boolean;
	/** The /live gallery's group (Do, Learn, Play, Track); the landing groups by suggestionGroups. */
	group?: string;
	/** For a chat recording: the /live widget demo (live/demos/<id>.svelte) it answers for. */
	demo?: string;
}

/** A hero chip with no recording behind it: live chat only. */
export interface ChatPrompt {
	id: string;
	title: string;
	prompt: string;
	steps?: boolean;
	needsStore?: boolean;
	group?: string;
}

export const scenarios: Scenario[] = [
	{ id: 'bill-splitter', title: 'Split the bill', category: 'Everyday', fixture: billSplitter, group: 'Do' },
	{ id: 'savings-calculator', title: 'Watch savings grow', category: 'Money', fixture: savingsCalculator, group: 'Learn' },
	{ id: 'tokyo-trip', title: 'Plan 5 days in Tokyo', category: 'Travel', fixture: tokyoTrip, group: 'Do' },
	{ id: 'sales-dashboard', title: 'Executive dashboard', category: 'Work', fixture: salesDashboard, group: 'Track' },
	{ id: 'flashcards', title: 'Spanish flashcards', category: 'Learning', fixture: flashcards, group: 'Learn' },
	{ id: 'hiit-workout', title: '20-minute HIIT', category: 'Fitness', fixture: hiitWorkout, group: 'Track' },
	{ id: 'meal-plan', title: 'High-protein week', category: 'Food', fixture: mealPlan, group: 'Track' },
	{ id: 'plane-3d', title: 'See a plane in 3D', category: 'Learning', fixture: plane3d, prompt: 'Show me a plane in 3D and label its parts', group: 'Learn' },
	{ id: 'heart-pump', title: 'How a heart pumps', category: 'Learning', fixture: heartPump, prompt: 'How does the heart pump blood?', group: 'Learn' },
	{ id: 'bike-gears', title: 'How bike gears work', category: 'Learning', fixture: bikeGears, prompt: 'How do bike gears work?', group: 'Learn' }
];

/**
 * Recordings of the /live widget demos (the hand-built components in
 * live/demos) and the playground's example spec, so the chat can answer every
 * gallery example with a real model run. Chat only: they are not gallery runs,
 * so the grid keeps showing the demos themselves.
 */
const chat = (category: string, fixture: ScenarioFixture, demo: string): Scenario => ({ id: fixture.id, title: fixture.title, category, fixture, demo });
export const chatRecordings: Scenario[] = [
	chat('Booking', appointment, 'booking'),
	chat('Food', cafeMenu, 'menu-order'),
	chat('Shopping', compareTech, 'comparison-layout'),
	chat('Food', findRecipe, 'recipe'),
	chat('Shopping', trackOrder, 'order-status'),
	chat('Work', missionControl, 'mission-control'),
	chat('Money', companySnapshot, 'classic'),
	chat('Work', newsletterSignup, 'flow'),
	chat('Everyday', helloCard, 'playground')
];
/** Demos with no chat recording: a flow step is a live multi-step host flow (the laptop and trip chips). */
export const LIVE_ONLY_DEMOS = ['choice-cards'];

export const chatPrompts: ChatPrompt[] = [
	{ id: 'book-table', title: 'Book a table', prompt: 'Book a table for 4 on Saturday evening', steps: true, needsStore: true, group: 'Do' },
	{ id: 'plan-trip', title: 'Plan a trip with me', prompt: 'Help me plan a trip step by step', steps: true, group: 'Do' },
	{ id: 'pick-laptop', title: 'Help me pick a laptop', prompt: 'Help me choose a laptop: ask me a few questions first', steps: true, group: 'Do' },
	{ id: 'shop-headphones', title: 'Shop headphones', prompt: 'Show me wireless headphones under $200 side by side so I can compare and pick one (sample products)' },
	{ id: 'find-deals', title: 'Find deals', prompt: 'Show me the best deals on kitchen gadgets this week, sorted by biggest discount (sample prices)' },
	{ id: 'restaurant-search', title: 'Restaurant search', prompt: 'Find Italian restaurants near me with ratings, price range and distance (sample places)' },
	{ id: 'draft-announcement', title: 'Draft announcement', prompt: 'Draft a short team announcement about our new office opening, with a title and a few lines I can edit' },
	{ id: 'create-survey', title: 'Create survey', prompt: 'Make me a 5-question customer feedback survey with star ratings and a comment box' },
	{ id: 'drawing-pad', title: 'Drawing pad', prompt: 'Give me a simple drawing pad with a few colors, a brush size and a clear button' },
	{ id: 'pack-list', title: 'Pack for trip', prompt: 'Make me a packing checklist for a 4-day beach weekend, grouped into clothes, toiletries and gear' },
	{ id: 'project-timeline', title: 'Project timeline', prompt: 'Show a timeline for a 6-week website redesign with milestones and owners (sample project)' },
	{ id: 'task-checklist', title: 'Task checklist', prompt: 'Make me a checklist for moving apartments that I can tick off as I go' },
	{ id: 'view-calendar', title: 'View calendar', prompt: 'Show me a month calendar with a few sample events on it' },
	{ id: 'take-quiz', title: 'Take a quiz', prompt: 'Quiz me with 5 world geography questions and show my score at the end' },
	{ id: 'explain-concept', title: 'Explain concept', prompt: 'Explain how compound interest works in a few lines, with a simple chart' },
	{ id: 'skeleton-3d', title: 'Explore a skeleton in 3D', prompt: 'Show me a human skeleton in 3D and label the main bones', group: 'Learn' },
	{ id: 'heart-3d', title: 'Explore the heart in 3D', prompt: 'Show me a human heart in 3D and label its chambers and main vessels', group: 'Learn' },
	{ id: 'study-plan', title: 'Study plan', prompt: 'Make me a 4-week study plan for learning basic statistics, a few hours a week' },
	{ id: 'health-summary', title: 'Health summary', prompt: 'Summarize my week of health data: steps, sleep and resting heart rate, with trends (sample data)' },
	{ id: 'expense-breakdown', title: 'Expense breakdown', prompt: 'Break down my monthly expenses by category in a chart (sample budget)' },
	{ id: 'create-invoice', title: 'Create invoice', prompt: 'Make me an invoice for 3 hours of design work and a logo package, with tax and a total (sample client)' },
	{ id: 'financial-summary', title: 'Financial summary', prompt: 'Give me a quarterly financial summary: revenue, costs, profit and cash, with trends (sample company)' },
	{ id: 'review-nda', title: 'Review NDA', prompt: 'Review a sample mutual NDA and flag the clauses I should read closely, with a short note on each' },
	{ id: 'due-diligence', title: 'Due diligence', prompt: 'Make me a due diligence checklist for buying a small online shop, with a status for each item' },
	{ id: 'compliance-check', title: 'Compliance check', prompt: 'Run a privacy check on a sample signup form and list what passes and what needs fixing' },
	{ id: 'pizza', title: 'Order pizza', prompt: 'Build me a pizza: pick a size, crust and toppings and show the price (sample menu)' },
	{ id: 'yoga', title: 'Yoga session', prompt: 'Guide me through a 15-minute morning yoga session, one pose at a time with a timer' },
	{ id: 'track-progress', title: 'Track progress', prompt: 'Track my running over the last 8 weeks: distance and pace in a chart (sample data)' },
	{ id: 'podcasts', title: 'Podcast discovery', prompt: 'Suggest science podcasts I might like, with topics and episode lengths (sample shows)' },
	{ id: 'weekend-getaway', title: 'Weekend getaway', prompt: 'Plan a weekend getaway to the mountains: where to stay, what to do and a rough budget (sample places)' }
];

/** One chip in a group: its id, its lucide icon name, and an optional shorter title for the chip. */
export type GroupChip = [id: string, icon: string, title?: string];

/** The landing's suggestion groups, in order, each chip in order. Labels render uppercase. */
export const suggestionGroups: { label: string; chips: GroupChip[] }[] = [
	{
		label: 'Browse & discover',
		chips: [
			['pick-laptop', 'laptop'],
			['shop-headphones', 'headphones'],
			['desk-deals', 'shopping-bag', 'Browse products'],
			['compare-tech', 'columns-2'],
			['find-deals', 'tag'],
			['track-order', 'navigation', 'Track my order'],
			['restaurant-search', 'utensils-crossed'],
			['coffee-nearby', 'coffee', 'Find coffee shops'],
			['lisbon-walk', 'navigation', 'Get directions'],
			['lisbon-weather', 'cloud', 'Weather forecast']
		]
	},
	{
		label: 'Create & build',
		chips: [
			['draft-announcement', 'megaphone'],
			['create-survey', 'clipboard-list'],
			['drawing-pad', 'pencil'],
			['newsletter-signup', 'megaphone', 'Newsletter signup'],
			['hello-card', 'square-check', 'Welcome card']
		]
	},
	{
		label: 'Organize',
		chips: [
			['pack-list', 'briefcase'],
			['project-timeline', 'git-branch'],
			['task-checklist', 'square-check'],
			['my-week', 'list-checks', 'Weekly schedule'],
			['focus-timer', 'timer'],
			['idea-notes', 'sticky-note', 'Take notes'],
			['view-calendar', 'calendar'],
			['habit-tracker', 'list-todo']
		]
	},
	{
		label: 'Learn & explore',
		chips: [
			['flashcards', 'languages'],
			['take-quiz', 'graduation-cap'],
			['explain-concept', 'lightbulb'],
			['study-plan', 'book-open'],
			['bike-gears', 'bike'],
			['heart-pump', 'heart-pulse', 'How a heart pumps'],
			['plane-3d', 'box'],
			['heart-3d', 'box'],
			['skeleton-3d', 'box'],
			['rocket-engine', 'rocket', 'Inside a rocket engine'],
			['ion-thruster', 'rocket', 'How a plasma thruster works'],
			['tokamak', 'lightbulb', 'How a fusion reactor works'],
			['fission-reactor', 'lightbulb', 'How a fission reactor works'],
			['particle-collider', 'circle-dot', 'How a particle collider works'],
			['iso-engine', 'activity', 'Inside a piston engine']
		]
	},
	{
		label: 'Work & productivity',
		chips: [
			['health-summary', 'heart'],
			['expense-breakdown', 'chart-pie'],
			['sales-dashboard', 'trending-up'],
			['create-invoice', 'receipt'],
			['financial-summary', 'dollar-sign'],
			['review-nda', 'file-search'],
			['due-diligence', 'search'],
			['compliance-check', 'shield'],
			['team-sync', 'file-text', 'Meeting agenda'],
			['bill-splitter', 'split'],
			['savings-calculator', 'piggy-bank'],
			['company-snapshot', 'trending-up', 'Company snapshot'],
			['mission-control', 'rocket', 'Mission control']
		]
	},
	{
		label: 'Lifestyle',
		chips: [
			['pizza', 'pizza'],
			['cafe-menu', 'coffee', 'Order from a cafe'],
			['meal-plan', 'salad', 'Meal planning'],
			['find-recipe', 'chef-hat'],
			['hiit-workout', 'dumbbell', 'HIIT workout'],
			['yoga', 'person-standing'],
			['track-progress', 'activity'],
			['ocean-docs', 'film', 'Find documentaries'],
			['focus-music', 'music', 'Play music'],
			['podcasts', 'podcast']
		]
	},
	{
		label: 'Planning',
		chips: [
			['book-table', 'concierge-bell'],
			['plan-trip', 'map'],
			['appointment', 'calendar-check'],
			['tokyo-trip', 'plane', 'Plan Tokyo trip'],
			['weekend-getaway', 'tree-palm']
		]
	},
	{
		label: 'Play',
		chips: [
			['memory-match', 'layout-grid'],
			['word-guess', 'whole-word'],
			['space-trivia', 'rocket'],
			['tic-tac-toe', 'hash'],
			['connect-four', 'circle-dot']
		]
	},
	{
		label: 'For business',
		chips: [
			['refund-approval', 'receipt'],
			['incident-rollback', 'shield'],
			['return-exchange', 'shopping-bag'],
			['book-appointment', 'calendar-check'],
			['quote-builder', 'file-text']
		]
	}
];

/** A resolved chip, ready for the chat's suggestion panel. */
export interface SuggestionChip {
	id: string;
	title: string;
	prompt: string;
	steps?: boolean;
	group: string;
	icon: string;
}

/** The chips on offer, grouped and ordered by suggestionGroups; ids not in `pool` drop out. */
export function groupedSuggestions(pool: (Scenario | ChatPrompt)[]): SuggestionChip[] {
	const byId = new Map(pool.map((c) => [c.id, c]));
	return suggestionGroups.flatMap(({ label, chips }) =>
		chips.flatMap(([id, icon, title]) => {
			const c = byId.get(id);
			if (!c) return [];
			const prompt = c.prompt ?? ('fixture' in c ? c.fixture.prompt : '');
			return [{ id, title: title ?? c.title, prompt, steps: c.steps, group: label, icon }];
		})
	);
}

/**
 * Runs set inside a business: an agent asking before it acts, a shop's own
 * widget, a work app. They play on /live under "For business", each in its
 * business's brand (brands.ts). The landing's chat replays them unbranded,
 * from the For business chip group.
 */
export const BUSINESS_GROUP = 'For business';
export const businessScenarios: Scenario[] = [
	{ id: 'refund-approval', title: 'Approve a refund', category: 'Support', fixture: refundApproval, group: BUSINESS_GROUP },
	{ id: 'incident-rollback', title: 'Roll back a bad deploy', category: 'Ops', fixture: incidentRollback, group: BUSINESS_GROUP },
	{ id: 'return-exchange', title: 'Swap a size', category: 'Store', fixture: returnExchange, group: BUSINESS_GROUP },
	{ id: 'book-appointment', title: 'Book a haircut', category: 'Booking', fixture: bookAppointment, group: BUSINESS_GROUP },
	{ id: 'quote-builder', title: 'Draft a client quote', category: 'Work app', fixture: quoteBuilder, group: BUSINESS_GROUP }
];
