<!-- src/lib/widgets/display/Mention.svelte
     An @handle pill: the accent at 10% behind --ripple-accent-text (never the
     fill token as text), so it reads as a faint wash in both themes. A linked
     mention deepens to 15% and underlines on hover; the hover card is optional.
     `name` is coerced and stripped of leading @, so "@dana" never shows "@@";
     an empty name renders nothing. Only a safeUrl-approved href becomes a
     link; anything else (javascript:, junk) renders the plain pill. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import * as HC from '$lib/components/ui/hover-card/index.js';
  import { cn } from '$lib/utils.js';
  import { asText } from '$lib/widgets/text-coerce';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Username (no @ — added automatically). */
    name: string;
    /** Display name shown in the hover card header. */
    displayName?: string;
    /** Optional avatar URL. */
    avatar?: string;
    /** Optional role / title shown in the hover card. */
    role?: string;
    /** Hover-card body. */
    bio?: string;
    href?: string;
    /** Disable the hover card — render plain inline pill only. */
    plain?: boolean;
  }

  let {
    id,
    class: className,
    style,
    name,
    displayName,
    avatar,
    role,
    bio,
    href,
    plain = false
  }: Props = $props();

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  // `name`/`displayName` are string-typed but a binding can deliver a number —
  // coerce before .split so initials derivation never crashes the canvas.
  function initials(s: unknown): string {
    return asText(s)
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  const bare = $derived(asText(name).trim().replace(/^@+/, ''));
  const handle = $derived(`@${bare}`);
  const link = $derived(safeUrl(href));
  // [overflow-wrap:anywhere] lets a very long handle break inside the card.
  const pill =
    'inline-flex max-w-full items-center gap-0.5 rounded-md bg-primary/10 text-ripple-accent-text font-medium px-1.5 py-0 text-[0.95em] [overflow-wrap:anywhere]';
  const linked = 'hover:bg-primary/15 hover:underline underline-offset-2 transition-colors';
</script>

{#if !bare}
  <!-- No name: nothing to mention. -->
{:else if plain || (!displayName && !bio && !role && !avatar)}
  {#if link}
    <a
      {id}
      href={safeUrl(href)}
      class={cn(pill, linked, className)}
      style={styleString}
    >
      {handle}
    </a>
  {:else}
    <span
      {id}
      class={cn(pill, className)}
      style={styleString}
    >
      {handle}
    </span>
  {/if}
{:else}
  <HC.Root>
    <HC.Trigger>
      {#snippet child({ props: triggerProps })}
        {#if link}
          <a
            {...triggerProps}
            {id}
            href={safeUrl(href)}
            class={cn(pill, linked, className)}
            style={styleString}
          >
            {handle}
          </a>
        {:else}
          <span
            {...triggerProps}
            {id}
            class={cn(pill, 'hover:bg-primary/15 transition-colors cursor-default', className)}
            style={styleString}
          >
            {handle}
          </span>
        {/if}
      {/snippet}
    </HC.Trigger>
    <HC.Content class="w-64 p-3">
      <div class="flex items-start gap-3">
        {#if avatar}
          <img src={safeUrl(avatar, { kind: 'resource' })} alt={displayName ?? bare} class="h-10 w-10 rounded-full object-cover shrink-0" />
        {:else}
          <span class="grid place-items-center h-10 w-10 rounded-full bg-primary/15 text-ripple-accent-text text-xs font-bold shrink-0">
            {initials(displayName ?? bare)}
          </span>
        {/if}
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">{displayName ?? bare}</div>
          <div class="text-xs text-muted-foreground truncate">{handle}{role ? ` · ${role}` : ''}</div>
          {#if bio}
            <p class="mt-1.5 text-xs">{bio}</p>
          {/if}
        </div>
      </div>
    </HC.Content>
  </HC.Root>
{/if}
