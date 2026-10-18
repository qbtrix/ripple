#!/usr/bin/env node
// Ripple MCP server for the Claude Code plugin. Exposes one tool, ripple_render,
// that shows a Ripple JSON spec as a live card inline in the chat (MCP Apps:
// the tool links a ui:// resource; the host loads it in a sandboxed iframe and
// hands it the tool input over postMessage). Zero dependencies: stdio JSON-RPC
// by hand. The card HTML loads the Ripple embed bundle from jsDelivr, so the
// resource declares that origin in its CSP.

import { createInterface } from 'node:readline';

const EMBED_URL =
	process.env.RIPPLE_EMBED_URL ||
	'https://cdn.jsdelivr.net/gh/qbtrix/ripple-iui@17eb80ca657ee7728aa07ca114284e76bbca3bc0/packages/svelte/embed-dist/ripple-embed.js';
const CARD_URI = 'ui://ripple/card.html';
const CARD_MIME = 'text/html;profile=mcp-app';

const TOOL = {
	name: 'ripple_render',
	title: 'Show a Ripple card',
	description:
		'Render a Ripple UI spec as an interactive card inline in the chat. Use it when an answer reads better as UI: ' +
		'charts, tables, diagrams (mermaid in markdown), math (LaTeX in markdown), dashboards, comparisons, step lists. ' +
		'spec is {"version":"1.0","state":{},"ui":{"type":"card","props":{"title":"..."},"children":[...]}}. ' +
		'Widget types and props follow the ripple skill (skills/ripple). Keep explanation prose in your reply, the card holds the visual.',
	inputSchema: {
		type: 'object',
		properties: {
			spec: { type: 'object', description: 'Ripple spec: {version, state?, ui}' },
		},
		required: ['spec'],
	},
	_meta: { ui: { resourceUri: CARD_URI } },
};

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
let embed, mounted = false, lastSpec;
async function show(spec) {
  if (!spec || typeof spec !== 'object' || !spec.ui) return err('No Ripple spec in the tool input.');
  if (JSON.stringify(spec) === lastSpec) return; lastSpec = JSON.stringify(spec);
  try {
    embed ??= await import(${JSON.stringify(EMBED_URL)});
    if (mounted && embed.update) embed.update(spec);
    else { embed.mount(root, spec, { theme: dark ? 'dark' : 'light' }); mounted = true; }
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
await request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'ripple-card', version: '0.1.0' }, appCapabilities: {} });
send({ method: 'ui/notifications/initialized', params: {} });
</script></body></html>`;

function handle(msg) {
	const { method, params } = msg;
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: params?.protocolVersion || '2025-06-18',
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: 'ripple', version: '0.1.0' },
				instructions:
					'When the user asks for ripple, ripple_render, or a visual answer in chat (chart, table, diagram, ' +
					'math, comparison, dashboard), call the ripple_render tool instead of writing an HTML page or artifact. ' +
					'If ripple_render is listed as a deferred tool, load its schema first (ToolSearch "select:mcp__ripple__ripple_render"). ' +
					'Put the explanation in your reply text; the card holds the visual.',
			};
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: [TOOL] };
		case 'tools/call': {
			if (params?.name !== TOOL.name) throw { code: -32602, message: `Unknown tool ${params?.name}` };
			const spec = params.arguments?.spec;
			if (!spec || typeof spec !== 'object' || !spec.ui)
				return { isError: true, content: [{ type: 'text', text: 'spec must be an object with a ui node.' }] };
			const title = spec.ui?.props?.title;
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
					{
						uri: CARD_URI,
						mimeType: CARD_MIME,
						text: cardHtml(),
						_meta: { ui: { csp: { resourceDomains: ['https://cdn.jsdelivr.net'] }, prefersBorder: false } },
					},
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
	if (msg.id === undefined) return; // notification
	try {
		out({ jsonrpc: '2.0', id: msg.id, result: handle(msg) });
	} catch (e) {
		out({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? -32603, message: e.message ?? String(e) } });
	}
});
