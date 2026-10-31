<!-- discover/CreatorLine.svelte — "by <name>" with the creator's small avatar,
     under a card's title (tile and row). Draws nothing without a creator name,
     so a listing whose maker did not opt in leaves no gap or placeholder.
     Internal to the card set (not exported). -->
<script lang="ts">
  import CreatorAvatar from './CreatorAvatar.svelte';
  import type { DiscoverItem } from './types.js';

  let { creator, class: className }: { creator: DiscoverItem['creator']; class?: string } = $props();
</script>

{#if creator?.name}
  <!-- Not cn(): tailwind-merge reads text-footnote and text-muted-foreground as one group. -->
  <p class={`m-0 flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground ${className ?? ''}`} data-testid="discover-creator">
    <CreatorAvatar name={creator.name} avatarUrl={creator.avatarUrl} />
    <span class="truncate">by {creator.name}</span>
  </p>
{/if}
