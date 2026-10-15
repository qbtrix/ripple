// routes/live/suggestions.test.ts — The landing's suggestion groups resolve as the brief lists them.
// Every chip (recorded, chat-only, play) sits in its group in order, in live
// and replay mode alike; ids missing from a pool drop out, and so do groups
// left empty. Every chip on offer has a place in suggestionGroups and an icon,
// and no topic has two chips (bike gears and the heart each open their figure).

import { expect, test } from 'vitest';
import { chatPrompts, groupedSuggestions, scenarios, suggestionGroups } from './scenarios.js';
import { playScenarios } from '../pawbar/play-cards.js';
import { pickScenario } from '../pawbar/recorded.js';
import { chipIcons } from '../pawbar/chip-icons.js';

const all = [...scenarios, ...chatPrompts, ...playScenarios];
const byGroup = (chips: ReturnType<typeof groupedSuggestions>) => {
	const out: Record<string, string[]> = {};
	for (const c of chips) (out[c.group] ??= []).push(c.title);
	return out;
};

test('live, all 8 groups render with the listed chips in order', () => {
	const groups = byGroup(groupedSuggestions(all));
	expect(Object.keys(groups)).toEqual(['Browse & discover', 'Create & build', 'Organize', 'Learn & explore', 'Work & productivity', 'Lifestyle', 'Planning', 'Play']);
	expect(groups['Browse & discover']).toEqual(['Help me pick a laptop', 'Shop headphones', 'Browse products', 'Compare tech', 'Find deals', 'Restaurant search', 'Find coffee shops', 'Get directions', 'Weather forecast']);
	expect(groups['Create & build']).toEqual(['Draft announcement', 'Create survey', 'Drawing pad']);
	expect(groups['Organize']).toEqual(['Pack for trip', 'Project timeline', 'Task checklist', 'Weekly schedule', 'Focus timer', 'Take notes', 'View calendar', 'Habit tracker']);
	expect(groups['Learn & explore']).toEqual(['Spanish flashcards', 'Take a quiz', 'Explain concept', 'Study plan', 'How bike gears work', 'How a heart pumps', 'See a plane in 3D', 'Explore the heart in 3D', 'Explore a skeleton in 3D']);
	expect(groups['Work & productivity']).toEqual(['Health summary', 'Expense breakdown', 'Sales dashboard', 'Create invoice', 'Financial summary', 'Review NDA', 'Due diligence', 'Compliance check', 'Meeting agenda', 'Split the bill', 'Watch savings grow']);
	expect(groups['Lifestyle']).toEqual(['Order a burger', 'Order pizza', 'Meal planning', 'Find a recipe', 'HIIT workout', 'Yoga session', 'Track progress', 'Find documentaries', 'Play music', 'Podcast discovery']);
	expect(groups['Planning']).toEqual(['Book a table', 'Plan a trip with me', 'Book appointment', 'Plan Tokyo trip', 'Weekend getaway']);
	expect(groups['Play']).toEqual(['Memory match', 'Guess the word', 'Space trivia', 'Tic-tac-toe', 'Connect four']);
});

test('ids missing from the pool drop out, and so do groups left empty', () => {
	const recorded = [...scenarios, ...playScenarios].filter((s) => !s.needsStore);
	const groups = byGroup(groupedSuggestions(recorded));
	expect(Object.keys(groups)).toEqual(['Organize', 'Learn & explore', 'Work & productivity', 'Lifestyle', 'Planning', 'Play']);
	expect(groups['Lifestyle']).toEqual(['Meal planning', 'HIIT workout']);
});

test('every chip on offer has a group, an icon and a prompt; step chips keep their tag', () => {
	const placed = suggestionGroups.flatMap((g) => g.chips.map(([id]) => id));
	expect(new Set(placed).size).toBe(placed.length);
	expect(all.map((c) => c.id).filter((id) => !placed.includes(id))).toEqual([]);
	expect(placed.filter((id) => !all.some((c) => c.id === id))).toEqual([]);
	for (const c of groupedSuggestions(all)) {
		expect(chipIcons[c.icon], c.icon).toBeTruthy();
		expect(c.prompt.length).toBeGreaterThan(10);
	}
	expect(groupedSuggestions(all).filter((c) => c.steps).map((c) => c.id)).toEqual(['pick-laptop', 'order-burger', 'book-table', 'plan-trip']);
});

test('no duplicate chips: one bike gears chip and one heart chip, each opening its figure', () => {
	const chips = groupedSuggestions(all);
	const titles = chips.map((c) => c.title);
	expect(new Set(titles).size).toBe(titles.length);
	expect(titles).not.toContain('Bike gears, explained');
	expect(titles).not.toContain('The heart as a pump');
	const bike = chips.find((c) => c.title === 'How bike gears work')!;
	const heart = chips.find((c) => c.title === 'How a heart pumps')!;
	expect([bike.id, heart.id]).toEqual(['bike-gears', 'heart-pump']);
	// Both replay the hand-built figure, not the older drawing.
	expect(pickScenario(bike.prompt).id).toBe('bike-gears');
	expect(pickScenario(heart.prompt).id).toBe('heart-pump');
	expect(pickScenario(heart.prompt).fixture.chunks.map((c) => c.text).join('')).toContain('"type":"figure"');
	// The old drawings are gallery runs now, never chips.
	expect(all.map((c) => c.id)).not.toContain('explainer');
	expect(all.map((c) => c.id)).not.toContain('heart');
});
