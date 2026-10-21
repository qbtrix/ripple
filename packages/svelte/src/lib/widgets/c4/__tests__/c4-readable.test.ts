// c4-readable.test.ts — a level ELK lays out far wider than tall is laid out again for reading
// (runReadable): paw-enterprise's own model, eighteen components fanning into one API client, comes
// out readable; a level that already fits keeps its first layout; and what `readable` changes.

import { describe, it, expect } from 'vitest';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { computeElkGraph, readable, LABEL_CAP } from '../elk-layout.js';
import { buildSemanticFlow } from '../semantic-flow.js';
import type { C4Diagram } from '$lib/widgets/c4/types.js';

// paw-enterprise's own model (docs/c4/model.json on dev): one container of 18 components, most of
// them calling the API client, and four systems around it. Ids, names and relationship text verbatim.
const PE_COMPONENTS: [string, string][] = [
  ["core-chat", "Chat Core"],
  ["api-client", "API Client"],
  ["stores", "Stores"],
  ["pockets", "Pockets"],
  ["ripple-host", "Ripple Host"],
  ["fabric", "Fabric"],
  ["instinct", "Instinct"],
  ["sites", "Sites"],
  ["code", "Code + Filesystem"],
  ["workspaces", "Workspaces"],
  ["belt", "Belt Console"],
  ["code-mode", "Code Mode + Ship"],
  ["agent-ops", "Agents + Operations"],
  ["billing", "Billing + Credits"],
  ["growth", "Growth + Partners"],
  ["other-hand", "Otherhand"],
  ["paw-bar", "Paw Bar + Concierge"],
  ["platform", "Platform Glue"],
];
const PE_SYSTEMS: [string, string][] = [
  ["pocketpaw", "PocketPaw Backend"],
  ["ripple", "Ripple (@ripple-ui/core + @ripple-ui/svelte)"],
  ["tauri", "Tauri Desktop Shell"],
  ["in-tab-runtime", "In-tab runtimes"],
];
const PE_LINKS: [string, string, string][] = [
  ["core-chat", "api-client", "sends chat messages + receives SSE run events [fetch / SSE]"],
  ["core-chat", "ripple-host", "passes rippleSpec payloads for generative-UI rendering"],
  ["core-chat", "stores", "writes streaming message chunks and session state"],
  ["core-chat", "pockets", "reads active pocket context for surface stamping"],
  ["pockets", "ripple-host", "pocket-ripple-adapter wires run_source / call_binding into the ripple frame"],
  ["pockets", "api-client", "pocket CRUD calls (create / read / update / delete) [REST]"],
  ["fabric", "api-client", "fetches ontology objects and links [REST]"],
  ["instinct", "api-client", "submits proposals and approve/reject decisions [REST]"],
  ["sites", "api-client", "site CRUD, domain management, and publish actions [REST]"],
  ["code", "api-client", "file read / write / tree listing via backend code surface [REST]"],
  ["workspaces", "api-client", "workspace and collaborator management calls [REST]"],
  ["ripple-host", "ripple", "imports @ripple-ui/svelte and @ripple-ui/core to instantiate widget components [file: deps]"],
  ["api-client", "pocketpaw", "all REST calls + SSE chat-run stream to the PocketPaw backend [HTTP / SSE]"],
  ["paw-enterprise-core", "tauri", "IPC for token storage, tray, global shortcuts, and multi-window management [Tauri IPC]"],
  ["belt", "api-client", "reads lines, runs, feeds, mandates, blueprints and C4 status; writes reviews and mandates [REST]"],
  ["code-mode", "api-client", "project, repo connect, scaffold, sandbox and ship calls [REST]"],
  ["code-mode", "in-tab-runtime", "boots an in-tab runtime for project previews [JS SDK]"],
  ["agent-ops", "api-client", "agent CRUD, activity, ledger, approvals, automations, logs and lens reads [REST]"],
  ["billing", "api-client", "credit ledger, top-ups, plans, entitlements, BYOK and storage usage [REST]"],
  ["growth", "api-client", "growth, partner, discover and checker calls (discover and checker without auth) [REST]"],
  ["other-hand", "api-client", "Otherhand session calls [REST]"],
  ["paw-bar", "api-client", "concierge admin calls under /paw-bar/admin [REST]"],
  ["platform", "tauri", "notifications, window drag and desktop helpers on the desktop build [Tauri IPC]"],
  ["code-mode", "tauri", "local-disk git, LSP and terminal on the desktop build [Tauri IPC]"],
  ["growth", "agent-ops", "queues outbound drafts for review through the shared approvals store"],
];

const pe: C4Diagram = {
  level: 'context',
  title: '',
  elements: [
    {
      id: 'paw-enterprise', name: 'Paw Enterprise', kind: 'system',
      children: [{ id: 'paw-enterprise-core', name: 'Paw Enterprise', kind: 'container', children: PE_COMPONENTS.map(([id, name]) => ({ id, name, kind: 'component' as const })) }],
    },
    ...PE_SYSTEMS.map(([id, name]) => ({ id, name, kind: 'system' as const, external: true })),
  ],
  relationships: PE_LINKS.map(([from, to, label]) => ({ from, to, label })),
};

describe('runReadable', { timeout: 60000 }, () => {
  it("lays paw-enterprise's model out about as tall as it is wide", async () => {
    // The viewer's default view: the system open, its container open, every component drawn.
    const flow = await buildSemanticFlow(pe, new Set(['paw-enterprise', 'paw-enterprise-core']), 'paw-enterprise', {});
    const r = flow.rects.get('paw-enterprise')!;
    // First pass: 7211 x 884, every component in one row.
    expect(r.width / r.height).toBeLessThan(1.5);
    for (const [id] of PE_COMPONENTS) expect(flow.rects.has(id), id).toBe(true);
    const labels = flow.edges.map((e) => (e.data as { labelBox?: { width: number } }).labelBox).filter((b) => !!b);
    expect(labels.length).toBeGreaterThan(0);
    for (const b of labels) expect(b.width).toBeLessThanOrEqual(LABEL_CAP);
  });

  it('keeps a level that fits as ELK first laid it out', async () => {
    const tall: C4Diagram = {
      level: 'container',
      title: '',
      elements: [{ id: 'a', name: 'A', kind: 'container' }, { id: 'b', name: 'B', kind: 'container' }],
      relationships: [{ from: 'a', to: 'b', label: 'streams every run event it sees back to the caller over SSE' }],
    };
    const { positions, routes } = await computeElkGraph(tall);
    expect(positions.get('b')!.y).toBeGreaterThan(positions.get('a')!.y);
    // Not wrapped: one line, as wide as its text.
    expect(routes.get(0)!.label).toMatchObject({ height: 20 });
    expect(routes.get(0)!.label!.width).toBeGreaterThan(LABEL_CAP);
  });
});

describe('readable', () => {
  it('caps the layers of every compound and wraps only long middle labels', () => {
    const label = (text: string, width: number, placement?: string) => ({
      text, width, height: 20, ...(placement ? { layoutOptions: { 'elk.edgeLabels.placement': placement } } : {}),
    });
    const graph: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.direction': 'DOWN' },
      children: [{ id: 'box', children: [{ id: 'x', width: 10, height: 10 }] }, { id: 'leaf', width: 10, height: 10 }],
      edges: [{ id: 'e', sources: ['x'], targets: ['leaf'], labels: [label('long', 400), label('short', 100), label('badge', 400, 'TAIL')] }],
    };
    const out = readable(graph);
    expect(out.layoutOptions).toMatchObject({ 'elk.direction': 'DOWN', 'elk.layered.layering.strategy': 'COFFMAN_GRAHAM' });
    expect(out.children![0].layoutOptions).toMatchObject({ 'elk.layered.layering.coffmanGraham.layerBound': '5' });
    expect(out.children![1].layoutOptions).toBeUndefined();
    // 400 wide: 384 of text in lines of 164 is three lines.
    expect(out.edges![0].labels!.map((l) => [l.width, l.height])).toEqual([[LABEL_CAP, 48], [100, 20], [400, 20]]);
    expect(graph.edges![0].labels![0].width).toBe(400);
  });
});
