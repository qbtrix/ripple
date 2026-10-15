<!--
  routes/ds/call/+page.svelte: the call parts on /ds in all three layouts
  (pill, bar and classic controls; glass, focus and classic tiles):
  ControlButton and ControlBar with a CountBadge, ParticipantTile with a menu
  holding the Slider, a FloatingDock in a frame, IncomingCallCard and a
  BottomSheet. Mock state only. Imports from `$lib/ui` directly, like a
  hand-written caller. The tile grid starts below a top strip, so the dock
  (top-right) never covers a tile.
-->
<script lang="ts">
  import {
    ControlButton,
    ControlBar,
    ParticipantTile,
    FloatingDock,
    IncomingCallCard,
    BottomSheet,
    Popover,
    Slider,
    Segmented,
  } from '$lib/ui/index.js';
  import { Button } from '$lib/primitives/index.js';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Video from '@lucide/svelte/icons/video';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import PhoneOff from '@lucide/svelte/icons/phone-off';
  import Phone from '@lucide/svelte/icons/phone';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Showcase from '../Showcase.svelte';

  type Layout = 'glass' | 'focus' | 'classic';
  let layout = $state<Layout>('glass');
  const ctl = $derived(layout === 'glass' ? 'pill' : layout === 'focus' ? 'bar' : 'classic');
  let muted = $state(false);
  let camera = $state(true);
  let chatOpen = $state(false);
  let unread = $state(3);
  let speaker = $state('maya');
  let volume = $state(1);
  let stop = $state<'peek' | 'half' | 'full'>('peek');
  let log = $state('');
  const people = [
    { id: 'maya', name: 'Maya Chen' },
    { id: 'ada', name: 'Ada Brennan', muted: true },
    { id: 'paw', name: 'Paw', agent: true },
  ];
</script>

<Showcase slug="call">
  {#snippet intro()}
    <p>
      Svelte components for a call screen: <code>ControlButton</code> and <code>ControlBar</code>,
      <code>ParticipantTile</code>, a draggable <code>FloatingDock</code>, <code>IncomingCallCard</code>,
      <code>BottomSheet</code> and <code>Slider</code>. Import them from <code>@ripple-ui/svelte/ui</code>. Switch the
      layout to see the three control styles; the state here is mock data.
    </p>
  {/snippet}

  <div class="mb-6 flex flex-wrap items-center gap-4 text-foreground">
    <Button variant="outline" size="sm" onclick={() => (speaker = people[(people.findIndex((p) => p.id === speaker) + 1) % people.length].id)}>Next speaker</Button>
    <Segmented
      size="sm"
      options={[
        { value: 'glass', label: 'Glass' },
        { value: 'focus', label: 'Focus' },
        { value: 'classic', label: 'Classic' },
      ]}
      value={layout}
      onchange={(v) => (layout = v as Layout)}
    />
  </div>

  <!-- The stage: dark in both themes, like the app's call stage. -->
  <section class="dark relative h-[520px] overflow-hidden rounded-2xl bg-background text-foreground">
    <div class="grid h-[calc(100%-6rem)] grid-cols-3 gap-3 px-4 pb-4 pt-20">
      {#each people as p (p.id)}
          <ParticipantTile name={p.name} skin={layout} speaking={speaker === p.id} muted={p.muted} data-testid="tile">
            {#snippet badge()}
              {#if p.agent}<span class="rounded bg-ripple-accent/20 px-1 text-[10px] uppercase">Agent</span>{/if}
            {/snippet}
            {#snippet menu()}
              <Popover.Root>
                <Popover.Trigger class="grid size-7 place-items-center rounded-full bg-ripple-surface/60" aria-label={`Volume for ${p.name}`}>
                  <Ellipsis class="size-4" />
                </Popover.Trigger>
                <Popover.Content class="w-56 p-3" align="end">
                  <p class="mb-2 text-sm">Volume {Math.round(volume * 100)}%</p>
                  <Slider.Root type="single" bind:value={volume} min={0} max={2} step={0.05} aria-label={`Volume for ${p.name}`} />
                </Popover.Content>
              </Popover.Root>
            {/snippet}
          </ParticipantTile>
      {/each}
    </div>

    <div class="absolute inset-x-0 bottom-3 flex justify-center" class:bottom-0={layout === 'focus'}>
      <ControlBar label="Call controls" variant={ctl}>
        <ControlButton variant={ctl} label={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} pressed={muted} tone={muted ? 'danger' : 'default'} onclick={() => (muted = !muted)}>
          {#snippet icon()}{#if muted}<MicOff />{:else}<Mic />{/if}{/snippet}
        </ControlButton>
        <ControlButton variant={ctl} label="Camera" aria-label={camera ? 'Turn camera off' : 'Turn camera on'} pressed={camera} tone={camera ? 'accent' : 'default'} onclick={() => (camera = !camera)}>
          {#snippet icon()}<Video />{/snippet}
        </ControlButton>
        <ControlButton
          variant={ctl}
          label="Chat"
          aria-label={chatOpen ? 'Close chat' : `Open chat, ${unread} unread`}
          pressed={chatOpen}
          tone={chatOpen ? 'accent' : 'default'}
          count={chatOpen ? 0 : unread}
          badgeTestId="call-chat-badge"
          onclick={() => ((chatOpen = !chatOpen), (unread = 0))}
        >
          {#snippet icon()}<MessageSquare />{/snippet}
        </ControlButton>
        <ControlButton variant={ctl} label="Leave" aria-label="Leave call" tone="danger" wide onclick={() => (log = 'Leave call')}>
          {#snippet icon()}<PhoneOff />{/snippet}
        </ControlButton>
      </ControlBar>
    </div>

    <FloatingDock label="Call dock" bounds="parent" corner="top-right" onPositionChange={(p) => (log = `dock moved to ${p.x}, ${p.y}`)}>
      <div class="flex items-center gap-2 p-2">
        <div class="size-11"><ParticipantTile name="Maya Chen" size="orb" skin="glass" speaking /></div>
        <span class="text-sm font-medium">Design sync</span>
        <ControlBar label="Dock controls" size="compact">
          <ControlButton size="compact" aria-label="Mute" pressed={muted} onclick={() => (muted = !muted)}>
            {#snippet icon()}<Mic />{/snippet}
          </ControlButton>
          <ControlButton size="compact" tone="danger" aria-label="Leave call">
            {#snippet icon()}<PhoneOff />{/snippet}
          </ControlButton>
        </ControlBar>
      </div>
    </FloatingDock>
  </section>

  <div class="mt-8 grid gap-8 md:grid-cols-2">
    <div class="dark flex flex-col gap-3 rounded-2xl bg-background p-4 text-foreground">
      <IncomingCallCard title="Maya Chen" subtitle="Incoming call · Design sync">
        {#snippet secondary()}
          <Button variant="destructive" size="icon" aria-label="Decline call"><PhoneOff /></Button>
        {/snippet}
        {#snippet primary()}
          <Button variant="success" size="icon" aria-label="Accept call"><Phone /></Button>
        {/snippet}
      </IncomingCallCard>
      <IncomingCallCard title="Call in progress" subtitle="Paw standup · 3 in call" role="status" halo={false}>
        {#snippet primary()}
          <Button variant="success" size="sm" aria-label="Join call"><Phone />Join</Button>
        {/snippet}
      </IncomingCallCard>
    </div>

    <div class="dark relative h-80 overflow-hidden rounded-2xl bg-background text-foreground">
      <p class="p-4 text-sm text-muted-foreground">
        A bottom sheet with three stops: peek, half and full. Drag its handle or press it to move between them. Now at:
        <strong>{stop}</strong>.
      </p>
      <BottomSheet bind:stop label="Call chat" handleLabel={(s) => (s === 'peek' ? 'Open chat' : s === 'half' ? 'Expand chat' : 'Shrink chat')}>
        <p class="px-4 text-sm">Maya: the deck is in the channel.</p>
      </BottomSheet>
    </div>
  </div>

  <p class="event-log" aria-live="polite">Last action: {log || 'none yet. Drag the dock or press Leave.'}</p>
</Showcase>
