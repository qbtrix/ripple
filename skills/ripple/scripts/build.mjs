#!/usr/bin/env node
// build.mjs: builds one Ripple card from an ask, in rounds, with no agent in
// the loop. Part of the Ripple skill (skills/ripple); run `node build.mjs --help`.
//
// It is a host for `buildSpec` from `@ripple-ui/core/build`: a model writes a
// spec, core's pure audit and render.mjs's renderer() check it, the faults go
// back as one feedback block, and it stops clean, at no progress, at 4 rounds
// or at 300 s. Everything lands in <outdir>: round-N/<width>-<theme>.png per
// round, rounds.json (rewritten after each round), spec.json (the best round)
// and result.json (why it stopped). Exit 0 when it stopped clean, 1 otherwise,
// 2 on a usage or setup error.
//
// The model is injected. The default runs the local Claude Code CLI
// (`claude -p`, the user's own login, no API key) with every tool off and no
// settings, from the temp dir so no CLAUDE.md is read. `--model <alias>`
// picks its model; `--model-cmd "<shell cmd>"` swaps it for any command that
// reads the prompt on stdin and prints the spec (or `claude -p
// --output-format json` style JSON) on stdout. Tokens come from the CLI's
// usage; a command that reports none is counted at 4 chars a token.
//
// Core resolves from the caller's project (`@ripple-ui/core`, built), then
// from this ripple checkout's built dist, then its source (bun only).

import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { renderer, SetupError } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = 'https://ripple-site.pawsites.workers.dev';
const WALL_CLOCK_MS = 300_000;
const USAGE = `usage: node build.mjs "<ask>" <outdir> [options]

Builds a Ripple card for <ask> in up to 4 rounds (300 s cap), rendering and
auditing each round. Writes <outdir>/round-N/*.png, rounds.json, spec.json and
result.json.

options:
  --base <url>         Ripple site to render through (env RIPPLE_BASE), default ${DEFAULT_BASE}
  --model <alias>      model for the default claude -p call (e.g. sonnet)
  --model-cmd <cmd>    shell command used instead of claude -p: prompt on stdin, spec on stdout
  --help               this text

needs: what render.mjs needs (Playwright with Chromium in the current project),
       the claude CLI logged in (or --model-cmd), and a built @ripple-ui/core
       (bun run build in packages/core) unless run with bun from a ripple checkout.

exit:  0 stopped clean, 1 stopped otherwise, 2 usage or setup error`;

// --- the model --------------------------------------------------------------

const section = (text, from, to) => {
	const a = text.indexOf(from);
	const b = to ? text.indexOf(to, a + from.length) : -1;
	return a < 0 ? '' : text.slice(a, b < 0 ? undefined : b).trim();
};

/** The rules every round gets: the skill's two rules, its quality bar, how to write a spec, the widget map and the craft rules. */
export function systemPrompt(now) {
	const skill = readFileSync(join(here, '../SKILL.md'), 'utf8');
	const ref = (f) => readFileSync(join(here, '../references', f), 'utf8');
	return [
		'You write Ripple specs: the {version, state, ui} JSON that Ripple renders as an interactive card.',
		`Today is ${now.iso.slice(0, 10)} (${now.tz}).`,
		section(skill, '## The two rules', '## Files'),
		section(skill, '### 3. Write the spec', '### 4.'),
		ref('widgets.md'),
		ref('craft.md'),
		'Reply with exactly one spec in one ```json block and nothing else. When you get your last spec and its faults, return the whole fixed spec, keeping every fact the user gave.'
	].join('\n\n');
}

/** The per-round message: the ask, then the best spec so far and its faults. */
export function userPrompt({ prompt, prior, feedback }) {
	const parts = [`The ask: ${prompt}`];
	if (prior !== undefined) parts.push('Your last spec:\n```json\n' + JSON.stringify(prior) + '\n```');
	if (feedback) parts.push(feedback);
	return parts.join('\n\n');
}

/** Runs a command with `input` on stdin; resolves stdout, rejects on a non-zero exit or an abort. */
function exec(cmd, args, input, { signal, shell = false } = {}) {
	return new Promise((ok, no) => {
		const child = spawn(cmd, args, { cwd: tmpdir(), shell, signal, stdio: ['pipe', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('error', no);
		child.on('close', (code) => (code === 0 ? ok(out) : no(new Error(`${cmd} exited ${code}: ${(err || out).trim().slice(0, 500)}`))));
		child.stdin.end(input);
	});
}

/** `claude -p --output-format json` output, or plain text counted at 4 chars a token. */
function readReply(stdout, sent) {
	try {
		const j = JSON.parse(stdout);
		if (j && typeof j.result === 'string') {
			if (j.is_error) throw new Error(`model error: ${j.result.slice(0, 300)}`);
			const u = j.usage ?? {};
			const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
			return { text: j.result, tokens: tokens || Math.ceil((sent.length + j.result.length) / 4) };
		}
	} catch (e) {
		if (String(e.message).startsWith('model error')) throw e;
	}
	return { text: stdout, tokens: Math.ceil((sent.length + stdout.length) / 4) };
}

/** The default Model: the local Claude Code CLI, no tools, no settings, no session kept. */
export function claudeModel({ system, model }) {
	const args = ['-p', '--output-format', 'json', '--tools', '', '--setting-sources', '', '--no-session-persistence', '--system-prompt', system];
	if (model) args.push('--model', model);
	return async (req) => {
		const input = userPrompt(req);
		return readReply(await exec('claude', args, input, { signal: req.signal }), system + input);
	};
}

/** A Model from any shell command: the whole prompt on stdin. */
export function commandModel({ system, cmd }) {
	return async (req) => {
		const input = `${system}\n\n${userPrompt(req)}`;
		return readReply(await exec(cmd, [], input, { signal: req.signal, shell: true }), input);
	};
}

// --- core -------------------------------------------------------------------

async function loadCore() {
	const tries = [
		() => createRequire(join(process.cwd(), 'package.json')).resolve('@ripple-ui/core/build'),
		() => {
			const p = join(here, '../../../packages/core/dist/build/index.js');
			if (!existsSync(p)) throw new Error('no dist');
			return p;
		},
		() => {
			if (!process.versions.bun) throw new Error('source needs bun');
			return join(here, '../../../packages/core/src/build/index.ts');
		}
	];
	for (const t of tries) {
		let path;
		try {
			path = t();
		} catch {
			continue;
		}
		return import(pathToFileURL(path).href);
	}
	throw new SetupError('cannot load @ripple-ui/core/build. Install @ripple-ui/core in this project, or build it in the ripple checkout (cd packages/core && bun run build), or run this script with bun from a ripple checkout.');
}

// --- the CLI ----------------------------------------------------------------

async function main() {
	const args = process.argv.slice(2);
	if (args.includes('--help') || args.includes('-h')) {
		console.log(USAGE);
		process.exit(0);
	}
	const flag = (name, dflt) => {
		const i = args.indexOf(`--${name}`);
		if (i < 0) return dflt;
		const v = args[i + 1];
		args.splice(i, 2);
		return v;
	};
	const base = flag('base', process.env.RIPPLE_BASE || DEFAULT_BASE).replace(/\/$/, '');
	const modelName = flag('model', undefined);
	const modelCmd = flag('model-cmd', undefined);
	const [ask, outArg] = args;
	const die = (msg) => {
		console.error(`build.mjs: ${msg}`);
		process.exit(2);
	};
	if (!ask || !outArg) die(`missing arguments\n\n${USAGE}`);
	const outdir = resolve(outArg);

	try {
		const { buildSpec } = await loadCore();
		let manifest;
		try {
			manifest = await (await fetch(`${base}/manifest.json`, { signal: AbortSignal.timeout(10_000) })).json();
		} catch (e) {
			throw new SetupError(`cannot read ${base}/manifest.json (${e.message}); pass --base to a running Ripple site`);
		}
		const widgetTypes = (manifest.widgets ?? []).map((w) => w.type);
		if (!widgetTypes.length) throw new SetupError(`${base}/manifest.json lists no widgets`);

		const d = new Date();
		const now = { iso: d.toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
		const system = systemPrompt(now);
		const model = modelCmd ? commandModel({ system, cmd: modelCmd }) : claudeModel({ system, model: modelName });
		mkdirSync(outdir, { recursive: true });
		let n = 0;
		const rounds = [];
		const started = d.getTime();

		const res = await buildSpec({
			preset: 'card',
			prompt: ask,
			model,
			renderer: (spec) => renderer(spec, { base, outdir: join(outdir, `round-${++n}`) }),
			widgetTypes,
			widgets: manifest.widgets,
			now,
			signal: AbortSignal.timeout(WALL_CLOCK_MS),
			onRound: (r) => {
				rounds.push(r);
				writeFileSync(join(outdir, 'rounds.json'), JSON.stringify(rounds, null, 2));
				console.error(`round ${r.n}: score ${r.score}, ${r.faults} faults, ${r.tokens} tokens, ${r.accepted ? 'accepted' : 'not accepted'}`);
			}
		});

		const best = [...res.rounds].reverse().find((r) => r.accepted) ?? null;
		if (res.spec !== null) writeFileSync(join(outdir, 'spec.json'), JSON.stringify(res.spec, null, 2));
		const result = {
			ask,
			base,
			model: modelCmd ? `cmd: ${modelCmd}` : `claude -p${modelName ? ` --model ${modelName}` : ''}`,
			now,
			stopped: res.stopped,
			bestRound: best?.n ?? null,
			score: best?.score ?? null,
			faults: best?.faults ?? null,
			rounds: res.rounds.length,
			tokens: res.tokens,
			ms: Date.now() - started,
			widgetFaults: res.widgetFaults,
			spec: res.spec === null ? null : join(outdir, 'spec.json')
		};
		writeFileSync(join(outdir, 'result.json'), JSON.stringify(result, null, 2));
		console.log(JSON.stringify(result, null, 2));
		process.exit(res.stopped === 'clean' ? 0 : 1);
	} catch (e) {
		if (e instanceof SetupError) die(e.message);
		throw e;
	}
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) await main();
