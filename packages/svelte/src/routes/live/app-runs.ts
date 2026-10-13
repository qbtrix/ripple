// routes/live/app-runs.ts — Hand-written /live runs for the app-like data widgets
// (notes, music, weather, week schedule, agenda, places, products, posters, a map
// route), then the hand-built figure runs (figureRuns, recorded fixtures: rocket
// engine, plasma thruster, fusion and fission reactors, particle collider), then
// the two drawings whose landing chips now open a figure (retiredChipRuns: the
// recorded bike gears explainer and the hand-written heart drawing).
// Gallery runs only: not landing chips, so the suggestion groups never see them.
// Each spec names no demo widget, so each run is its own card (gallery.ts
// widgetOf). Public site: fictional names, sample numbers.

import { handWritten, heartCard } from '../pawbar/play-cards.js';
import type { Scenario } from './scenarios.js';
import rocketEngine from './fixtures/rocket-engine.json';
import ionThruster from './fixtures/ion-thruster.json';
import tokamak from './fixtures/tokamak.json';
import fissionReactor from './fixtures/fission-reactor.json';
import particleCollider from './fixtures/particle-collider.json';
import explainer from './fixtures/explainer.json';

const card = (ui: object) => ({ state: {}, ui });

const notes = card({
	type: 'notes',
	bind: '{state.notes}',
	props: {
		title: 'Ideas',
		tags: ['idea', 'todo', 'read'],
		notes: [
			{ id: 'n1', title: 'Weekend market stall', text: 'Test a small batch of lemon cookies first.\nAsk Mia about the corner spot.', tags: ['idea'], pinned: true, color: 'yellow' },
			{ id: 'n2', title: 'Books to pick up', text: 'The Overstory, A Psalm for the Wild-Built', tags: ['read'] },
			{ id: 'n3', title: 'Bike', text: 'Book a service before the trip. New brake pads.', tags: ['todo'], color: 'blue' }
		]
	}
});

const music = card({
	type: 'music-player',
	bind: '{state.music}',
	props: {
		title: 'Focus mix',
		tracks: [
			{ title: 'Soft rain', sound: 'rain', minutes: 10, color: 'blue' },
			{ title: 'Late night keys', artist: 'Studio', sound: 'lofi', minutes: 4, color: 'violet' },
			{ title: 'Still water', sound: 'ocean', minutes: 8, color: 'teal' },
			{ title: 'Slow piano', sound: 'piano', minutes: 5, color: 'amber' },
			{ title: 'Pine forest', sound: 'forest', minutes: 12, color: 'green' }
		]
	}
});

const weather = card({
	type: 'weather-forecast',
	props: {
		place: 'Lisbon',
		unit: 'C',
		note: 'Sample forecast',
		now: { temp: 21, condition: 'partly-cloudy', feelsLike: 20, humidity: 64, wind: '14 km/h NW' },
		hourly: [
			{ time: 'Now', temp: 21, condition: 'partly-cloudy' },
			{ time: '15:00', temp: 22, condition: 'sunny' },
			{ time: '16:00', temp: 22, condition: 'sunny' },
			{ time: '17:00', temp: 21, condition: 'partly-cloudy', rainChance: 10 },
			{ time: '18:00', temp: 19, condition: 'cloudy', rainChance: 20 }
		],
		days: [
			{ day: 'Mon', condition: 'partly-cloudy', high: 23, low: 16, rainChance: 10, sunrise: '07:31', sunset: '18:52' },
			{ day: 'Tue', condition: 'sunny', high: 25, low: 17 },
			{ day: 'Wed', condition: 'cloudy', high: 21, low: 16, rainChance: 30 },
			{ day: 'Thu', condition: 'rain', high: 18, low: 14, rainChance: 80 },
			{ day: 'Fri', condition: 'thunder', high: 17, low: 13, rainChance: 90 },
			{ day: 'Sat', condition: 'partly-cloudy', high: 20, low: 14, rainChance: 20 },
			{ day: 'Sun', condition: 'sunny', high: 22, low: 15 }
		]
	}
});

const week = card({
	type: 'week-schedule',
	bind: '{state.selected}',
	props: {
		title: 'My week',
		startHour: 7,
		endHour: 21,
		events: [
			{ day: 'Mon', start: '09:00', end: '12:30', title: 'Deep work', color: 'blue' },
			{ day: 'Mon', start: '18:00', end: '19:00', title: 'Gym', place: 'Studio 4', color: 'green' },
			{ day: 'Tue', start: '09:00', end: '17:00', title: 'Office', color: 'gray' },
			{ day: 'Wed', start: '09:00', end: '12:30', title: 'Deep work', color: 'blue' },
			{ day: 'Wed', start: '18:00', end: '19:00', title: 'Gym', place: 'Studio 4', color: 'green' },
			{ day: 'Thu', start: '10:00', end: '11:00', title: 'Design review', color: 'purple' },
			{ day: 'Thu', start: '10:30', end: '11:30', title: '1:1 with Sam', color: 'orange' },
			{ day: 'Fri', start: '18:00', end: '19:00', title: 'Gym', place: 'Studio 4', color: 'green' },
			{ day: 'Sun', start: '19:00', end: '21:00', title: 'Family dinner', place: 'Home', color: 'pink' }
		]
	}
});

const agenda = card({
	type: 'agenda',
	bind: '{state.agenda}',
	props: {
		title: 'Weekly team sync',
		start: '10:00',
		items: [
			{ title: 'Wins from last week', owner: 'Maya Chen', minutes: 5 },
			{ title: 'Metrics review', owner: 'Leo Park', minutes: 8, notes: 'Signups, churn, support load' },
			{ title: 'Launch checklist', owner: 'Ana Ruiz', minutes: 10 },
			{ title: 'Blockers', minutes: 5 },
			{ title: 'Actions and owners', owner: 'Maya Chen', minutes: 2 }
		]
	}
});

const ask = (text: string) => ({ action: 'emit', target: 'ask', value: { text } });

const places = card({
	type: 'place-results',
	props: {
		title: 'Coffee in Baixa',
		query: 'quiet cafes with wifi',
		places: [
			{ id: 'p1', name: 'Blue Door Coffee', kind: 'cafe', rating: 4.7, reviews: 812, price: 2, distance: '350 m', walkMinutes: 4, open: true, hours: 'Until 6 pm', tags: ['wifi', 'quiet'], blurb: 'Bright corner room with long tables and pour-overs.', lat: 38.7118, lng: -9.1385 },
			{ id: 'p2', name: 'Morning Loaf', kind: 'bakery', rating: 4.5, reviews: 403, price: 1, distance: '0.6 km', walkMinutes: 8, open: false, hours: 'Opens 7 am', tags: ['pastries'], lat: 38.7097, lng: -9.1366 },
			{ id: 'p3', name: 'Tram Stop Cafe', kind: 'cafe', rating: 4.3, reviews: 221, price: 2, distance: '0.8 km', walkMinutes: 10, open: true, hours: 'Until 8 pm', tags: ['wifi', 'terrace'], lat: 38.7131, lng: -9.1331 },
			{ id: 'p4', name: 'Fig and Fern', kind: 'cafe', rating: 4.6, reviews: 517, price: 3, distance: '1.1 km', walkMinutes: 14, open: true, hours: 'Until 7 pm', tags: ['quiet', 'brunch'], lat: 38.7152, lng: -9.1412 }
		]
	},
	on_choose: ask('Tell me more about this place')
});

const products = card({
	type: 'product-grid',
	props: {
		title: 'Desk gear deals',
		currency: 'USD',
		products: [
			{ id: 'g1', name: 'Quietline 700', brand: 'Sonora', category: 'Audio', price: 229, was: 299, rating: 4.6, reviews: 2140, badge: 'Best seller', color: 'slate', specs: ['30 h battery', 'ANC'] },
			{ id: 'g2', name: 'Arc Lamp', brand: 'Lumo', category: 'Lighting', price: 59, was: 79, rating: 4.4, reviews: 512, color: 'amber', specs: ['Dimmable', 'USB-C'] },
			{ id: 'g3', name: 'Flow Keys', brand: 'Typeset', category: 'Keyboards', price: 119, rating: 4.7, reviews: 990, badge: 'New', color: 'teal', specs: ['Wireless', 'Low profile'] },
			{ id: 'g4', name: 'Stand Pro', brand: 'Lift', category: 'Stands', price: 45, was: 60, rating: 4.2, reviews: 310, color: 'green', specs: ['Aluminium'] },
			{ id: 'g5', name: 'Pulse Buds', brand: 'Arcwave', category: 'Audio', price: 79, was: 99, rating: 4.3, reviews: 860, color: 'violet', specs: ['IPX4', '8 h'] },
			{ id: 'g6', name: 'Glide Mouse', brand: 'Typeset', category: 'Mice', price: 39, rating: 4.5, reviews: 1204, color: 'blue', specs: ['Silent click'] }
		]
	},
	on_choose: ask('Tell me more about this product')
});

const posters = card({
	type: 'media-grid',
	bind: '{state.list}',
	props: {
		title: 'Ocean documentaries',
		kind: 'documentary',
		items: [
			{ id: 'd1', title: 'The Deep Blue Hours', by: 'Mara Ellison', year: 2021, minutes: 94, rating: 4.5, genres: ['Nature', 'Ocean'], blurb: 'A year with the night feeders of a kelp forest.', color: 'teal' },
			{ id: 'd2', title: 'Salt and Ice', by: 'Tomas Reyes', year: 2019, minutes: 82, rating: 4.2, genres: ['Climate'], color: 'blue' },
			{ id: 'd3', title: 'Whale Roads', by: 'Ines Duarte', year: 2022, minutes: 101, rating: 4.7, genres: ['Ocean', 'Wildlife'], color: 'slate' },
			{ id: 'd4', title: 'Reef at Night', by: 'Kofi Mensah', year: 2020, minutes: 76, rating: 4.1, genres: ['Nature'], color: 'violet' },
			{ id: 'd5', title: 'Tide Pools', by: 'Lena Ostrova', year: 2023, minutes: 58, rating: 4.4, genres: ['Nature', 'Family'], color: 'green' },
			{ id: 'd6', title: 'The Long Swim', by: 'Mara Ellison', year: 2018, minutes: 88, rating: 4.3, genres: ['Wildlife'], color: 'amber' }
		]
	}
});

// Rossio to Sao Jorge Castle on foot, approximate.
const WALK: [number, number][] = [
	[38.7139, -9.1394],
	[38.7128, -9.1381],
	[38.7121, -9.1372],
	[38.7116, -9.1358],
	[38.7121, -9.1347],
	[38.7131, -9.1339],
	[38.7139, -9.1334]
];
const lisbonWalk = {
	state: {},
	ui: {
		type: 'card',
		props: { title: 'Rossio to the castle', description: 'About 15 minutes on foot, mostly uphill. Route is approximate.' },
		children: [
			{
				type: 'map',
				props: {
					center: { lat: 38.7132, lng: -9.1362 },
					zoom: 16,
					height: '360px',
					markers: [
						{ id: 'start', lat: 38.7139, lng: -9.1394, label: 'Rossio station' },
						{ id: 'end', lat: 38.7139, lng: -9.1334, label: 'Sao Jorge Castle' }
					],
					route: WALK
				}
			},
			{
				type: 'steps',
				props: {
					steps: [
						{ title: 'Leave Rossio station', description: 'Cross the square heading east.' },
						{ title: 'Climb Rua da Madalena', description: 'Keep going uphill past the church.' },
						{ title: 'Follow the castle signs', description: 'Through the lanes of Alfama.' },
						{ title: 'Reach the main gate', description: 'On Rua de Santa Cruz do Castelo.' }
					]
				}
			}
		]
	}
};

const figure = (id: string, title: string, fixture: Scenario['fixture']): Scenario => ({ id, title, category: 'Learning', group: 'Learn', fixture });

/** The hand-built figure runs, in Learn grid order. live.test.ts replays each. */
export const figureRuns: Scenario[] = [
	figure('rocket-engine', 'Inside a rocket engine', rocketEngine),
	figure('ion-thruster', 'How a plasma thruster works', ionThruster),
	figure('tokamak', 'How a fusion reactor works', tokamak),
	figure('fission-reactor', 'How a nuclear fission reactor works', fissionReactor),
	figure('particle-collider', 'How a particle collider works', particleCollider)
];

/** Drawings that had a landing chip before the figures took it: same ids, so their /live links still open. */
export const retiredChipRuns: Scenario[] = [
	{ id: 'explainer', title: 'Bike gears, explained', category: 'Learning', fixture: explainer, prompt: 'How do bike gears work? Draw me an animated picture of the chain drive and explain it in a few lines.', group: 'Learn' },
	handWritten('heart', 'How a heart pumps', 'Learning', 'Learn', 'How does the heart pump blood? Draw an animated picture with numbered notes on the chambers and valves.', heartCard)
];

export const appScenarios: Scenario[] = [
	handWritten('lisbon-walk', 'Walk to the castle', 'Travel', 'Do', 'Show me on a map a walking route from Rossio station to Sao Jorge Castle in Lisbon, with the turns (approximate)', lisbonWalk),
	handWritten('coffee-nearby', 'Coffee nearby', 'Places', 'Do', 'Find quiet coffee shops with wifi near Baixa in Lisbon, with ratings and distance (sample places)', places),
	handWritten('desk-deals', 'Desk gear deals', 'Shopping', 'Do', 'Show me deals on home office gear I can filter and compare (sample products)', products),
	handWritten('idea-notes', 'Idea notes', 'Everyday', 'Track', 'Give me a notepad for ideas with tags, start with a few sample notes', notes),
	handWritten('my-week', 'My week', 'Everyday', 'Track', 'Lay out my week on a calendar: work blocks, the gym three times and family dinner on Sunday', week),
	handWritten('team-sync', 'Team sync agenda', 'Work', 'Track', 'Draft a 30-minute weekly team meeting agenda starting at 10:00, with timed items and owners', agenda),
	handWritten('lisbon-weather', 'Lisbon weather', 'Everyday', 'Track', 'Show me a 7-day weather forecast for Lisbon with highs, lows and chance of rain (sample data)', weather),
	handWritten('focus-music', 'Focus music', 'Everyday', 'Play', 'Make me a focus music player with a few calm tracks', music),
	handWritten('ocean-docs', 'Ocean documentaries', 'Learning', 'Learn', 'Recommend 6 ocean documentaries with ratings and running time (sample titles)', posters),
	...figureRuns,
	...retiredChipRuns
];
