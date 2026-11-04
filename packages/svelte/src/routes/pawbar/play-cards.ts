// routes/pawbar/play-cards.ts: The recorded answers behind the landing's play and
// habit chips (memory match, guess the word, space trivia, tic-tac-toe, connect
// four, habit tracker, focus timer) and the /live machine drawings (isoScenarios:
// the bike and heart came back as figures, the piston engine as an iso-scene).
// Every fixture is a real model stream from scripts/record-scenario.ts, the same
// as live/scenarios.ts; this file only groups them. A chip's prompt equals its
// fixture prompt, so pickScenario's exact match routes it. Each card must pass
// card-policy.ts at every streamed chunk (card-policy.test.ts holds the whole
// answer pool to it).

import type { Scenario, ScenarioFixture } from '../live/scenarios.js';
import memoryMatch from '../live/fixtures/memory-match.json';
import wordGuess from '../live/fixtures/word-guess.json';
import spaceTrivia from '../live/fixtures/space-trivia.json';
import ticTacToe from '../live/fixtures/tic-tac-toe.json';
import connectFour from '../live/fixtures/connect-four.json';
import habitTracker from '../live/fixtures/habit-tracker.json';
import focusTimer from '../live/fixtures/focus-timer.json';
import isoBike from '../live/fixtures/iso-bike.json';
import isoHeart from '../live/fixtures/iso-heart.json';
import isoEngine from '../live/fixtures/iso-engine.json';

/** A recording as a Scenario. */
export const recorded = (category: string, group: string, fixture: ScenarioFixture): Scenario => ({ id: fixture.id, title: fixture.title, category, group, fixture });

export const playScenarios: Scenario[] = [
	recorded('Games', 'Play', memoryMatch),
	recorded('Games', 'Play', wordGuess),
	recorded('Games', 'Play', spaceTrivia),
	recorded('Games', 'Play', ticTacToe),
	recorded('Games', 'Play', connectFour),
	recorded('Habits', 'Track', habitTracker),
	recorded('Habits', 'Track', focusTimer)
];

/** The machine drawings: gallery runs, not landing chips. */
export const isoScenarios: Scenario[] = [recorded('Learning', 'Learn', isoBike), recorded('Learning', 'Learn', isoHeart), recorded('Learning', 'Learn', isoEngine)];
