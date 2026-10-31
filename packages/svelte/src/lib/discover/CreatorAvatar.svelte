<!-- discover/CreatorAvatar.svelte — a creator's round avatar for the Discover
     cards and the detail view: ripple's Avatar with the picture (only an
     http(s) avatarUrl, through safeUrl) and the name's initials as the
     fallback, which is what the server markup and a broken picture show.
     Decorative: the name always sits beside it in text. Internal to the card
     set (not exported). -->
<script lang="ts">
  import { safeUrl } from '@ripple-ui/core';
  import * as Avatar from '../components/ui/avatar/index.js';
  import { cn } from '$lib/utils.js';
  import { creatorInitials, httpUrl } from './item.js';

  let {
    name,
    avatarUrl,
    size = 'sm',
    class: className,
  }: {
    name: string;
    avatarUrl?: string | null;
    /** sm: 20px on cards; lg: 32px on the detail view. */
    size?: 'sm' | 'lg';
    class?: string;
  } = $props();

  const src = $derived(httpUrl(avatarUrl));
</script>

<Avatar.Root
  size={size === 'lg' ? 'default' : 'sm'}
  class={cn(size === 'sm' ? 'size-5 data-[size=sm]:size-5' : 'size-8', className)}
  aria-hidden="true"
  data-testid="discover-creator-avatar"
>
  {#if src}<Avatar.Image src={safeUrl(src, { kind: 'resource' })} alt="" />{/if}
  <Avatar.Fallback class={cn('bg-secondary font-semibold text-secondary-foreground', size === 'sm' ? 'text-[9px]' : 'text-xs')}>{creatorInitials(name)}</Avatar.Fallback>
</Avatar.Root>
