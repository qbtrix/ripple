// critic.test.mjs: build.mjs's host critic, with no model and no browser.
// Pins what the critic is told (every lens, every rule id, each PNG path and
// offender box) and how its reply becomes CriticIssue[] (unknown lens dropped,
// unknown rule cleared, severity clamped, `spec` unless it says `widget`).
//   node --test skills/ripple/scripts/critic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticSystem, criticPrompt, criticIssues, hostCritic } from './build.mjs';

const rules = {
	lenses: [
		{ id: 'layout', question: 'Does it fit at 360 px?' },
		{ id: 'numbers', question: 'Do numbers carry units?' }
	],
	rules: [{ id: 'reads-at-phone', lens: 'layout', text: 'The card must read at 360 px and at 720 px.' }]
};
const renders = [
	{ width: 380, theme: 'light', png: '/out/round-1/380-light.png', audit: [], boxes: [{ check: 'overflow', path: '/ui/children/0', x: 10, y: 20, w: 400, h: 30 }] },
	{ width: 1024, theme: 'dark', png: null, audit: [], boxes: [] }
];

test('the critic is told every lens, every rule id, each PNG and each offender box', () => {
	const sys = criticSystem(rules);
	assert.match(sys, /- layout: Does it fit at 360 px\?/);
	assert.match(sys, /- numbers: /);
	assert.match(sys, /- reads-at-phone \(layout\): /);
	const user = criticPrompt({ prompt: 'a budget card', spec: { ui: { type: 'card' } }, renders });
	assert.match(user, /The ask: a budget card/);
	assert.match(user, /380 px, light: \/out\/round-1\/380-light\.png/);
	assert.match(user, /overflow at \/ui\/children\/0: x 10, y 20, 400 x 30 px/);
	assert.match(user, /1024 px, dark: \(no screenshot\)/);
});

test('the reply becomes CriticIssue[], with anything off-contract cleaned or dropped', () => {
	const issues = criticIssues(
		{
			issues: [
				{ lens: 'layout', rule: 'reads-at-phone', severity: 3, fixable: 'spec', path: '/ui/children/0', message: 'the row spills' },
				{ lens: 'numbers', rule: 'made-up-rule', severity: 9, fixable: 'widget', message: 'hours cut' },
				{ lens: 'vibes', severity: 1, message: 'not a lens' },
				{ lens: 'layout', severity: 0, path: 'not a pointer', message: 'tight' },
				{ lens: 'layout', message: '' }
			]
		},
		rules
	);
	assert.deepEqual(issues, [
		{ code: 'reads-at-phone', path: '/ui/children/0', message: 'the row spills', lens: 'layout', rule: 'reads-at-phone', severity: 3, fixable: 'spec' },
		{ code: 'numbers', path: '', message: 'hours cut', lens: 'numbers', severity: 3, fixable: 'widget' },
		{ code: 'layout', path: '', message: 'tight', lens: 'layout', severity: 1, fixable: 'spec' }
	]);
	assert.deepEqual(criticIssues(null, rules), []);
});

test('hostCritic passes the prompts through, returns the tokens, and throws on a non-JSON reply', async () => {
	const parse = (t) => {
		try {
			return { spec: JSON.parse(t) };
		} catch (e) {
			return { error: e.message };
		}
	};
	let seen;
	const critic = hostCritic(async (system, user) => {
		seen = { system, user };
		return { text: '{"issues":[{"lens":"layout","severity":2,"message":"cramped"}]}', tokens: 1234 };
	}, parse);
	const res = await critic({ spec: {}, renders, rules, prompt: 'x' });
	assert.equal(res.tokens, 1234);
	assert.equal(res.issues[0].severity, 2);
	assert.match(seen.system, /reads-at-phone/);
	assert.match(seen.user, /380-light\.png/);
	const bad = hostCritic(async () => ({ text: 'looks fine to me', tokens: 1 }), parse);
	await assert.rejects(bad({ spec: {}, renders, rules, prompt: 'x' }), /not JSON/);
});
