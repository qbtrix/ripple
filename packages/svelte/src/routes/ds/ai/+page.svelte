<!--
  routes/ds/ai/+page.svelte: the agent display widgets on /ds. stream-text
  (streaming and done), tool-call (pending, running, success, error; collapsed
  and expanded), reasoning-trace (summary, expanded steps, a streaming trace
  that names the active step, an error step) and approval-gate (each risk
  level, a gate with a diff and tool-call body, approved and denied states; the
  last gate is bound, so its decision round-trips through state and a text
  node under it reads it back; the high-risk gate asks for a deny reason).
  Each panel is one <Ripple {spec} />.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import Showcase from '../Showcase.svelte';

  const nav = [
    { href: '#stream-text', label: 'stream-text' },
    { href: '#tool-call', label: 'tool-call' },
    { href: '#reasoning-trace', label: 'reasoning-trace' },
    { href: '#approval-gate', label: 'approval-gate' }
  ];

  // 1 ── stream-text: streaming (caret + aria-busy) vs done
  const streamingSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '16px' },
      children: [
        {
          type: 'stream-text',
          props: {
            text: 'The agent is drafting a response and the caret keeps blinking while tokens arrive',
            streaming: true,
          },
        },
        {
          type: 'stream-text',
          props: {
            text: 'This message finished streaming: no caret, and aria-busy is false.',
            streaming: true,
            done: true,
          },
        },
        {
          type: 'stream-text',
          props: {
            markdown: true,
            streaming: true,
            text: '**Markdown** streaming: render `inline code`, lists, and emphasis as the text grows.',
          },
        },
      ],
    },
  };

  // 2 ── tool-call: the four statuses + collapsed/expanded defaults
  const toolCallSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '12px' },
      children: [
        {
          type: 'tool-call',
          props: { name: 'plan_request', status: 'pending', args: { goal: 'build the page' } },
        },
        {
          type: 'tool-call',
          props: { name: 'search_web', status: 'running', args: { query: 'ripple widget catalog' }, time: 'now' },
        },
        {
          type: 'tool-call',
          props: {
            name: 'read_file',
            status: 'success',
            args: { path: 'src/lib/widgets/index.ts' },
            result: 'Read 437 lines.',
            durationMs: 420,
            time: '2s ago',
          },
        },
        {
          type: 'tool-call',
          props: {
            name: 'write_file',
            status: 'error',
            args: { path: '/etc/hosts' },
            error: 'EACCES: permission denied, open \'/etc/hosts\'',
            durationMs: 12,
          },
        },
      ],
    },
  };

  // 3 ── reasoning-trace: collapsed summary vs pre-expanded steps + streaming
  const reasoningSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '12px' },
      children: [
        {
          type: 'reasoning-trace',
          props: {
            steps: [
              { title: 'Parse the request', status: 'done' },
              { title: 'Search the widget catalog', status: 'done' },
              { title: 'Compose the spec', status: 'done' },
            ],
          },
        },
        {
          type: 'reasoning-trace',
          props: {
            streaming: true,
            collapsed: false,
            steps: [
              { title: 'Parse the request', detail: 'User wants a streaming-text primitive.', status: 'done' },
              { title: 'Search the widget catalog', detail: 'Looking for an existing match before building.', status: 'thinking' },
            ],
          },
        },
        // Collapsed while streaming: the header names the active step.
        {
          type: 'reasoning-trace',
          props: {
            streaming: true,
            steps: [
              { title: 'Parse the request', status: 'done' },
              { title: 'Reading the vendor ledger', status: 'thinking' },
            ],
          },
        },
        // A step that failed.
        {
          type: 'reasoning-trace',
          props: {
            collapsed: false,
            steps: [
              { title: 'Parse the request', status: 'done' },
              { title: 'Call the catalog API', detail: 'Timed out after 30s.', status: 'error' },
            ],
          },
        },
      ],
    },
  };

  // 4 ── approval-gate: pending across each risk level
  const riskSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '12px' },
      children: [
        {
          type: 'approval-gate',
          props: {
            title: 'Tag 12 leads as "warm"',
            summary: 'A reversible CRM update on 12 records.',
            risk: 'low',
            actionId: 'act_low',
          },
        },
        {
          type: 'approval-gate',
          props: {
            title: 'Send the renewal email to 48 customers',
            summary: 'Outbound to 48 recipients. It cannot be unsent.',
            risk: 'medium',
            actionId: 'act_med',
          },
        },
        {
          type: 'approval-gate',
          props: {
            title: 'Delete 3 inactive workspaces',
            summary: 'Destructive: removes all data in those workspaces.',
            risk: 'high',
            actionId: 'act_high',
            // Deny asks for an optional reason first.
            askDenyReason: true,
          },
        },
      ],
    },
  };

  // 5 ── approval-gate: a rich gate composing a diff + a proposed tool call
  const richGateSpec = {
    version: '1.0' as const,
    ui: {
      type: 'approval-gate',
      props: {
        title: 'Upgrade 2 accounts to the Pro tier',
        summary: 'Reviews the config change and the write the agent will run.',
        risk: 'high',
        actionId: 'act_upgrade',
        body: 'The agent matched **2 accounts** over the seat threshold and proposes a tier change. Review the diff and the write before approving.',
        diff: {
          before: 'fernhill:\n  tier: free\n  seats: 12\nbluebird:\n  tier: free\n  seats: 9',
          after: 'fernhill:\n  tier: pro\n  seats: 12\nbluebird:\n  tier: pro\n  seats: 9',
          title: 'accounts.yaml',
        },
        toolCalls: [
          {
            name: 'update_accounts',
            status: 'pending',
            args: { ids: ['fernhill', 'bluebird'], tier: 'pro' },
          },
        ],
      },
    },
  };

  // 6 ── approval-gate: pre-resolved states (approved / denied), controls dimmed
  const resolvedSpec = {
    version: '1.0' as const,
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '12px' },
      children: [
        {
          type: 'approval-gate',
          props: {
            title: 'Refund order #4821',
            summary: '$240 refund to the customer.',
            risk: 'medium',
            decision: 'approved',
            decidedBy: 'Ada',
          },
        },
        {
          type: 'approval-gate',
          props: {
            title: 'Wipe the staging database',
            summary: 'Irreversible.',
            risk: 'high',
            decision: 'denied',
            decidedBy: 'Ada',
          },
        },
      ],
    },
  };

  // 7 ── approval-gate: BOUND: the decision persists to state on click.
  const boundGateSpec = {
    version: '1.0' as const,
    state: { gateDecision: 'pending' },
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '8px' },
      children: [
        {
          type: 'approval-gate',
          bind: '{state.gateDecision}',
          props: {
            title: 'Publish the new pricing page',
            summary: 'Approve or deny: the decision is written to state.gateDecision.',
            risk: 'medium',
            actionId: 'act_publish',
          },
        },
        { type: 'text', props: { text: 'state.gateDecision is now: {state.gateDecision}', size: 'sm' }, class: 'text-muted-foreground' },
      ],
    },
  };
</script>

<Showcase slug="ai" {nav}>
  {#snippet intro()}
    <p>
      Read-only widgets for showing an agent's work as it happens: text that streams in, the tools it calls, the steps
      it reasons through, and gates that stop for a person's approval before a risky action. Each panel is one
      <code>&lt;Ripple&gt;</code> spec.
    </p>
  {/snippet}

  <section id="stream-text" class="showcase-section">
    <h2 class="showcase-section-title"><code>stream-text</code></h2>
    <p class="section-caption">Streaming with a caret, finished, and streaming markdown.</p>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={streamingSpec} /></div></div>
  </section>

  <section id="tool-call" class="showcase-section">
    <h2 class="showcase-section-title"><code>tool-call</code></h2>
    <p class="section-caption">Pending, running, done and failed.</p>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={toolCallSpec} /></div></div>
  </section>

  <section id="reasoning-trace" class="showcase-section">
    <h2 class="showcase-section-title"><code>reasoning-trace</code></h2>
    <p class="section-caption">A collapsed summary, open steps while streaming, a collapsed trace naming its active step, and a failed step.</p>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={reasoningSpec} /></div></div>
  </section>

  <section id="approval-gate" class="showcase-section">
    <h2 class="showcase-section-title"><code>approval-gate</code></h2>
    <p class="section-caption">Low, medium and high risk. The high-risk gate asks for a reason when you deny it.</p>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={riskSpec} /></div></div>

    <h3 class="sub">With a diff and the tool call it will run</h3>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={richGateSpec} /></div></div>

    <h3 class="sub">Already decided</h3>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={resolvedSpec} /></div></div>

    <h3 class="sub">Bound to state</h3>
    <div class="showcase-item"><div class="showcase-item-demo"><Ripple spec={boundGateSpec} /></div></div>
  </section>
</Showcase>

<style>
  .sub {
    margin: 24px 0 10px;
    font-size: 15px;
    font-weight: 600;
  }
</style>
