#!/usr/bin/env node
// @ripple-ui/mcp: a stdio MCP server with one tool, ripple_render, that shows a
// Ripple JSON spec as a live card inline in the chat. It uses MCP Apps: the
// tool links the ui://ripple/card.html resource, the host loads that HTML in a
// sandboxed iframe and hands it the tool input over postMessage. Hosts without
// MCP Apps still get the tool's text result.
//
// Zero dependencies: JSON-RPC over stdio by hand, one message per line.
//
// Invariants:
// - The card loads @ripple-ui/embed from jsDelivr at an exact version
//   (EMBED_URL). Every origin the card loads from must be in CARD_CSP's
//   resourceDomains, or the host's CSP blocks it. The embed's widget chunks
//   come from the same jsDelivr path; map tiles come from the tile hosts.
// - serverInfo.version is read from package.json, and test/server.test.mjs
//   holds package.json, server.json and serverInfo to one version.
// - A bad tool call returns { isError: true }, never a JSON-RPC crash: the
//   model can read the message and retry with a fixed spec.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const { version: VERSION } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const EMBED_VERSION = '0.1.0';
const EMBED_URL =
	process.env.RIPPLE_EMBED_URL || `https://cdn.jsdelivr.net/npm/@ripple-ui/embed@${EMBED_VERSION}/dist/ripple-embed.js`;
const CARD_URI = 'ui://ripple/card.html';
const CARD_MIME = 'text/html;profile=mcp-app';
const CARD_CSP = {
	resourceDomains: [
		'https://cdn.jsdelivr.net',
		'https://tile.openstreetmap.org',
		'https://*.tile.openstreetmap.fr',
		'https://*.basemaps.cartocdn.com',
	],
};

const TOOL = {
	name: 'ripple_render',
	title: 'Show a Ripple card',
	description:
		'Render a Ripple UI spec as an interactive card inline in the chat. Use it when an answer reads better as UI: ' +
		'charts, tables, diagrams (mermaid in markdown), math (LaTeX in markdown), dashboards, comparisons, step lists. ' +
		'spec is {"version":"1.0","state":{},"ui":{"type":"card","props":{"title":"..."},"children":[...]}}. ' +
		'Widget types and props: https://ripple.pocketpaw.xyz/docs (machine-readable list: ' +
		'https://github.com/qbtrix/ripple/releases/latest/download/manifest.slim.json). ' +
		'Keep explanation prose in your reply, the card holds the visual.',
	inputSchema: {
		type: 'object',
		properties: {
			spec: { type: 'object', description: 'Ripple spec: {version, state?, ui}' },
		},
		required: ['spec'],
	},
	_meta: { ui: { resourceUri: CARD_URI } },
};

const INSTRUCTIONS =
	'When the user asks for ripple, ripple_render, or a visual answer in chat (chart, table, diagram, ' +
	'math, comparison, dashboard), call the ripple_render tool instead of writing an HTML page or artifact. ' +
	'If ripple_render is listed as a deferred tool, load its schema first. ' +
	'Put the explanation in your reply text; the card holds the visual.';

const cardHtml = () => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent}#root{min-height:40px}#err{font:13px system-ui;color:#c0392b;padding:8px}</style>
</head><body><div id="root"></div><div id="err" hidden></div>
<script type="module">
const root = document.getElementById('root');
const err = (m) => { const e = document.getElementById('err'); e.textContent = m; e.hidden = false; };
let nextId = 1; const pending = new Map();
const send = (msg) => window.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
const request = (method, params) => new Promise((res, rej) => {
  const id = nextId++; pending.set(id, { res, rej }); send({ id, method, params });
  setTimeout(() => pending.has(id) && (pending.delete(id), res(null)), 4000);
});
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
let embed, card, lastSpec;
async function show(spec) {
  if (!spec || typeof spec !== 'object' || !spec.ui) return err('No Ripple spec in the tool input.');
  const json = JSON.stringify(spec); if (json === lastSpec) return; lastSpec = json;
  try {
    embed ??= await import(${JSON.stringify(EMBED_URL)});
    if (card) card.update(spec);
    else card = embed.mount(root, spec, { theme: dark ? 'dark' : 'light' });
  } catch (e) { err('Ripple failed to load: ' + (e && e.message || e)); }
}
window.addEventListener('message', (ev) => {
  const m = ev.data; if (!m || m.jsonrpc !== '2.0') return;
  if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return m.error ? p.rej(m.error) : p.res(m.result); }
  if (m.method === 'ui/notifications/tool-input') show(m.params?.arguments?.spec);
  if (m.method === 'ui/notifications/tool-result') show(m.params?.structuredContent?.spec);
});
new ResizeObserver(() => send({ method: 'ui/notifications/size-changed',
  params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } })).observe(document.body);
await request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'ripple-card', version: ${JSON.stringify(VERSION)} }, appCapabilities: {} });
send({ method: 'ui/notifications/initialized', params: {} });
</script></body></html>`;

/** Models sometimes send the spec as a JSON string; accept that, reject anything else that is not an object. */
function readSpec(raw) {
	let spec = raw;
	if (typeof spec === 'string') {
		try {
			spec = JSON.parse(spec);
		} catch {
			return { error: 'spec is a string but not valid JSON.' };
		}
	}
	if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'spec must be a JSON object.' };
	if (!spec.ui || typeof spec.ui !== 'object' || typeof spec.ui.type !== 'string')
		return { error: 'spec.ui must be a node with a string type, e.g. {"type":"card","children":[]}.' };
	return { spec };
}

function handle({ method, params }) {
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: params?.protocolVersion || '2025-06-18',
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: 'ripple', version: VERSION },
				instructions: INSTRUCTIONS,
			};
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: [TOOL] };
		case 'tools/call': {
			if (params?.name !== TOOL.name) throw { code: -32602, message: `Unknown tool ${params?.name}` };
			const { spec, error } = readSpec(params.arguments?.spec);
			if (error) return { isError: true, content: [{ type: 'text', text: error }] };
			const title = spec.ui.props?.title;
			return {
				content: [{ type: 'text', text: `Rendered a Ripple card${title ? `: ${title}` : ''}. The user can see it.` }],
				structuredContent: { spec },
			};
		}
		case 'resources/list':
			return { resources: [{ uri: CARD_URI, name: 'Ripple card', mimeType: CARD_MIME }] };
		case 'resources/read':
			if (params?.uri !== CARD_URI) throw { code: -32602, message: `Unknown resource ${params?.uri}` };
			return {
				contents: [
					{ uri: CARD_URI, mimeType: CARD_MIME, text: cardHtml(), _meta: { ui: { csp: CARD_CSP, prefersBorder: false } } },
				],
			};
		default:
			throw { code: -32601, message: `Method not found: ${method}` };
	}
}

const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
createInterface({ input: process.stdin }).on('line', (line) => {
	if (!line.trim()) return;
	let msg;
	try {
		msg = JSON.parse(line);
	} catch {
		return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
	}
	if (!msg || typeof msg !== 'object' || msg.id === undefined) return; // notification
	try {
		out({ jsonrpc: '2.0', id: msg.id, result: handle(msg) });
	} catch (e) {
		out({ jsonrpc: '2.0', id: msg.id, error: { code: e?.code ?? -32603, message: e?.message ?? String(e) } });
	}
});
