<!--
  Skeleton.svelte: minimal loading placeholder, also shown by Ripple while a
  streaming spec hasn't produced its first valid parse yet.
  Variants: card (default, its own bordered box), dashboard, text, none. The
  text and dashboard blocks carry no padding, so they start on the content
  edge where the real content will land.
-->
<script lang="ts">
  interface Props {
    variant?: 'card' | 'dashboard' | 'text' | 'none';
    class?: string;
  }

  let { variant = 'card', class: className = '' }: Props = $props();
</script>

{#if variant === 'none'}
  <!-- render nothing — for callers who handle loading externally -->
{:else if variant === 'text'}
  <div class="rskeleton rskeleton--text animate-pulse space-y-2 {className}">
    <div class="h-4 bg-ripple-track rounded w-3/4"></div>
    <div class="h-4 bg-ripple-track rounded w-1/2"></div>
  </div>
{:else if variant === 'dashboard'}
  <div class="rskeleton rskeleton--dashboard animate-pulse grid grid-cols-3 gap-3 {className}">
    {#each Array(6) as _, i (i)}
      <div class="h-24 bg-ripple-track rounded"></div>
    {/each}
  </div>
{:else}
  <div class="rskeleton rskeleton--card animate-pulse rounded-lg border border-border p-4 space-y-3 {className}">
    <div class="h-5 bg-ripple-track rounded w-1/3"></div>
    <div class="h-4 bg-ripple-track rounded w-full"></div>
    <div class="h-4 bg-ripple-track rounded w-5/6"></div>
  </div>
{/if}
