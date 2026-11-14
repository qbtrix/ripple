// Drives the real ripple-mcp bin over stdio, the way a host does: one JSON-RPC
// message per line in, one response per line out. No mocks, no dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { after, before, test } from 'node:test';

const BIN = new URL('../ripple-mcp.mjs', import.meta.url);
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const pkg = readJson('../package.json');
const serverJson = readJson('../server.json');

let child;
let nextId = 1;
const waiting = new Map();
const unmatched = [];

function rpc(method, params) {
	const id = nextId++;
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
	return new Promise((resolve) => waiting.set(id, resolve));
}

before(() => {
	child = spawn(process.execPath, [BIN.pathname], { stdio: ['pipe', 'pipe', 'inherit'] });
	createInterface({ input: child.stdout }).on('line', (line) => {
		const msg = JSON.parse(line);
		const resolve = waiting.get(msg.id);
		if (resolve) waiting.delete(msg.id), resolve(msg);
		else unmatched.push(msg);
	});
});

after(() => child.kill());

test('initialize reports the package version', async () => {
	const res = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
	assert.equal(res.result.serverInfo.name, 'ripple');
	assert.equal(res.result.serverInfo.version, pkg.version);
	assert.ok(res.result.capabilities.tools && res.result.capabilities.resources);
});

test('tools/list returns ripple_render linked to the card resource', async () => {
	const { result } = await rpc('tools/list');
	assert.deepEqual(result.tools.map((t) => t.name), ['ripple_render']);
	const [tool] = result.tools;
	assert.deepEqual(tool.inputSchema.required, ['spec']);
	assert.equal(tool._meta.ui.resourceUri, 'ui://ripple/card.html');
});

test('resources/read returns the card HTML with the MCP Apps mime and a CSP for the embed', async () => {
	const { result } = await rpc('resources/read', { uri: 'ui://ripple/card.html' });
	const [card] = result.contents;
	assert.equal(card.uri, 'ui://ripple/card.html');
	assert.equal(card.mimeType, 'text/html;profile=mcp-app');
	assert.match(card.text, /^<!doctype html>/);
	const embed = card.text.match(/import\("([^"]+)"\)/)[1];
	assert.match(embed, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@ripple-ui\/embed@\d+\.\d+\.\d+\/dist\/ripple-embed\.js$/);
	assert.ok(card._meta.ui.csp.resourceDomains.includes(new URL(embed).origin), 'CSP must allow the embed origin');
});

test('resources/list advertises the same card', async () => {
	const { result } = await rpc('resources/list');
	assert.deepEqual(result.resources.map((r) => [r.uri, r.mimeType]), [['ui://ripple/card.html', 'text/html;profile=mcp-app']]);
});

test('a good spec renders and echoes the spec back for the card', async () => {
	const spec = { version: '1.0', ui: { type: 'card', props: { title: 'Q3' }, children: [] } };
	const { result } = await rpc('tools/call', { name: 'ripple_render', arguments: { spec } });
	assert.notEqual(result.isError, true);
	assert.match(result.content[0].text, /Q3/);
	assert.deepEqual(result.structuredContent.spec, spec);
});

test('a spec sent as a JSON string is accepted', async () => {
	const spec = { version: '1.0', ui: { type: 'card', children: [] } };
	const { result } = await rpc('tools/call', { name: 'ripple_render', arguments: { spec: JSON.stringify(spec) } });
	assert.notEqual(result.isError, true);
	assert.deepEqual(result.structuredContent.spec, spec);
});

test('malformed specs return a tool error and the server keeps answering', async () => {
	for (const spec of [undefined, 'not json {', 42, [], {}, { ui: 'card' }, { ui: { props: {} } }]) {
		const res = await rpc('tools/call', { name: 'ripple_render', arguments: { spec } });
		assert.equal(res.error, undefined, `spec ${JSON.stringify(spec)} must not be a protocol error`);
		assert.equal(res.result.isError, true, `spec ${JSON.stringify(spec)} must be a tool error`);
		assert.ok(res.result.content[0].text.length > 0);
	}
	assert.deepEqual((await rpc('ping')).result, {});
});

test('bad requests get JSON-RPC errors, not a crash', async () => {
	assert.equal((await rpc('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
	assert.equal((await rpc('resources/read', { uri: 'ui://other' })).error.code, -32602);
	assert.equal((await rpc('no/such/method')).error.code, -32601);
	child.stdin.write('this is not json\n');
	assert.deepEqual((await rpc('ping')).result, {});
	assert.ok(unmatched.some((m) => m.id === null && m.error.code === -32700));
});

test('package.json, server.json and serverInfo carry one version and one name', () => {
	assert.equal(serverJson.name, pkg.mcpName);
	assert.equal(serverJson.version, pkg.version);
	const [npm] = serverJson.packages;
	assert.equal(npm.identifier, pkg.name);
	assert.equal(npm.version, pkg.version);
	assert.equal(npm.transport.type, 'stdio');
	assert.ok(serverJson.description.length <= 100, 'registry caps description at 100 chars');
	assert.equal(pkg.bin['ripple-mcp'], 'ripple-mcp.mjs');
});
