<!-- discover/ItemMenu.svelte — the ⋯ overflow a card and the detail view share:
     Remix (cards only; a link with `remixHref`, which wins over `onremix`),
     Copy link and Report, each drawn only when its callback is passed;
     with none, no trigger is drawn. Internal to the card set (not exported). The
     menu is ripple's DropdownMenu, whose content mounts only when open, so the
     server markup is just the trigger button. -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Flag from '@lucide/svelte/icons/flag';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Link from '@lucide/svelte/icons/link';
  import { Button } from '../components/ui/button/index.js';
  import * as DropdownMenu from '../components/ui/dropdown-menu/index.js';

  let {
    title,
    remixHref,
    onremix,
    oncopy,
    onreport,
  }: {
    /** The item's title, for the trigger's accessible name. */
    title: string;
    /** Remix as a link. Wins over `onremix`. */
    remixHref?: string;
    /** Remix, for a card whose Remix icon hides on a narrow tile. */
    onremix?: () => void;
    oncopy?: () => void;
    onreport?: () => void;
  } = $props();
</script>

{#if remixHref || onremix || oncopy || onreport}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button {...props} size="icon-sm" variant="ghost" class="text-muted-foreground" aria-label={`More for ${title}`} title="More">
          <Ellipsis class="size-4" />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-40">
      {#if remixHref}
        <DropdownMenu.Item>
          {#snippet child({ props })}
            <a {...props} href={safeUrl(remixHref)}><GitFork />Remix</a>
          {/snippet}
        </DropdownMenu.Item>
      {:else if onremix}
        <DropdownMenu.Item onSelect={onremix}><GitFork />Remix</DropdownMenu.Item>
      {/if}
      {#if oncopy}
        <DropdownMenu.Item onSelect={oncopy}><Link />Copy link</DropdownMenu.Item>
      {/if}
      {#if onreport}
        <DropdownMenu.Item onSelect={onreport}><Flag />Report</DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
