// widgets/composite/exercise-figures.test.ts — the figure library: every
// figure is a well-formed, script-free SVG with a viewBox and SMIL animation,
// its still twin has none, aliases never collide across figures, and
// matchFigure picks by explicit id, then by name.
import { describe, expect, it } from 'vitest';
import { EXERCISE_FIGURES, FIGURE_IDS, matchFigure, normalizeExerciseName } from './exercise-figures.js';
import { sanitizeIllustrationSvg } from '$lib/security/illustration-svg.js';

const parse = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml');

describe('exercise figures: the library', () => {
	it('has about 30 figures including rest and the yoga set', () => {
		expect(FIGURE_IDS.length).toBeGreaterThanOrEqual(30);
		for (const id of ['rest', 'cat-cow', 'downward-dog', 'childs-pose', 'push-up', 'squat', 'jumping-jacks']) expect(FIGURE_IDS).toContain(id);
	});

	it.each(FIGURE_IDS)('%s parses as svg with a viewBox and an animation; its still has none', (id) => {
		const { svg, still } = EXERCISE_FIGURES[id];
		for (const markup of [svg, still]) {
			const doc = parse(markup);
			expect(doc.querySelector('parsererror')).toBeNull();
			expect(doc.documentElement.localName).toBe('svg');
			expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 64 64');
			expect(markup).not.toMatch(/<script|foreignObject|\son[a-z]+=|href|url\(/i);
		}
		expect(parse(svg).querySelectorAll('animate').length).toBeGreaterThan(0);
		expect(parse(still).querySelectorAll('animate').length).toBe(0);
	});

	it.each(FIGURE_IDS)('%s survives the illustration sanitizer with its animation intact', (id) => {
		const out = sanitizeIllustrationSvg(EXERCISE_FIGURES[id].svg, document, 'f-');
		expect(out).not.toBeNull();
		expect(out!.getElementsByTagName('animate').length).toBe(parse(EXERCISE_FIGURES[id].svg).querySelectorAll('animate').length);
	});

	it('no alias belongs to two figures', () => {
		const seen = new Map<string, string>();
		for (const id of FIGURE_IDS)
			for (const alias of EXERCISE_FIGURES[id].aliases) {
				expect(seen.get(alias), `"${alias}" in ${id} and ${seen.get(alias)}`).toBeUndefined();
				seen.set(alias, id);
			}
	});
});

describe('exercise figures: matchFigure', () => {
	it.each([
		['Cat-Cow', 'cat-cow'],
		['Downward Dog', 'downward-dog'],
		["Child's Pose", 'childs-pose'],
		['Child’s pose', 'childs-pose'],
		['Push-ups', 'push-up'],
		['Jumping Jacks', 'jumping-jacks'],
		['Bodyweight squats', 'squat'],
		['Jump squats', 'jump-squat'],
		['Reverse lunges', 'lunge'],
		['Glute bridges', 'glute-bridge'],
		['Bridge pose', 'bridge'],
		['Side plank (left)', 'side-plank'],
		['Plank shoulder taps', 'plank'],
		['Bicycle crunches', 'bicycle-crunch'],
		['Crunches', 'sit-up'],
		['Warrior II', 'warrior-two'],
		['Rest', 'rest']
	])('%s -> %s', (name, id) => expect(matchFigure(name)).toBe(id));

	it('returns null for an unknown name', () => {
		expect(matchFigure('Kettlebell swings')).toBeNull();
		expect(matchFigure('')).toBeNull();
	});

	it('a known explicit id wins over the name; an unknown one falls back to the name', () => {
		expect(matchFigure('Squats', 'cat-cow')).toBe('cat-cow');
		expect(matchFigure('Squats', 'not-a-figure')).toBe('squat');
		expect(matchFigure('Squats', 'toString')).toBe('squat');
	});

	it('normalizes case, punctuation, "pose" and plurals', () => {
		expect(normalizeExerciseName("  Child's   POSE! ")).toBe('child');
		expect(normalizeExerciseName('Crunches')).toBe('crunch');
		expect(normalizeExerciseName('Press')).toBe('press');
	});
});
