// routes/live/app-runs.ts — /live runs for the app-like data widgets (map route,
// places, products, notes, week schedule, agenda, weather, music, posters), then
// the figure runs (figureRuns: rocket engine, plasma thruster, fusion and fission
// reactors, particle collider), then the two drawings whose landing chips now
// open a figure (retiredChipRuns: the bike gears explainer and the heart
// drawing). All are real model recordings (scripts/record-scenario.ts). The
// suggestion groups point the app chips and the figure chips at these ids.
// Each spec names no demo widget, so each run is its own card (gallery.ts
// widgetOf). Public site: fictional names, sample numbers.

import { recorded } from '../pawbar/play-cards.js';
import type { Scenario } from './scenarios.js';
import lisbonWalk from './fixtures/lisbon-walk.json';
import coffeeNearby from './fixtures/coffee-nearby.json';
import deskDeals from './fixtures/desk-deals.json';
import ideaNotes from './fixtures/idea-notes.json';
import myWeek from './fixtures/my-week.json';
import teamSync from './fixtures/team-sync.json';
import lisbonWeather from './fixtures/lisbon-weather.json';
import focusMusic from './fixtures/focus-music.json';
import oceanDocs from './fixtures/ocean-docs.json';
import rocketEngine from './fixtures/rocket-engine.json';
import ionThruster from './fixtures/ion-thruster.json';
import tokamak from './fixtures/tokamak.json';
import fissionReactor from './fixtures/fission-reactor.json';
import particleCollider from './fixtures/particle-collider.json';
import explainer from './fixtures/explainer.json';
import heart from './fixtures/heart.json';

/** The figure runs, in Learn grid order. live.test.ts replays each. */
export const figureRuns: Scenario[] = [rocketEngine, ionThruster, tokamak, fissionReactor, particleCollider].map((f) => recorded('Learning', 'Learn', f));

/** Drawings that had a landing chip before the figures took it: same ids, so their /live links still open. */
export const retiredChipRuns: Scenario[] = [
	{ ...recorded('Learning', 'Learn', explainer), prompt: 'How do bike gears work? Draw me an animated picture of the chain drive and explain it in a few lines.' },
	recorded('Learning', 'Learn', heart)
];

export const appScenarios: Scenario[] = [
	recorded('Travel', 'Do', lisbonWalk),
	recorded('Places', 'Do', coffeeNearby),
	recorded('Shopping', 'Do', deskDeals),
	recorded('Everyday', 'Track', ideaNotes),
	recorded('Everyday', 'Track', myWeek),
	recorded('Work', 'Track', teamSync),
	recorded('Everyday', 'Track', lisbonWeather),
	recorded('Everyday', 'Play', focusMusic),
	recorded('Learning', 'Learn', oceanDocs),
	...figureRuns,
	...retiredChipRuns
];
