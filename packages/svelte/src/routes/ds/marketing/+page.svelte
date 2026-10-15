<!--
  routes/ds/marketing/+page.svelte: all nine marketing widgets on /ds, composed
  in order into one landing page for a fictional solar-install studio
  ("Lumen"): navbar, marketing-hero, cta, feature-grid, testimonial,
  logo-cloud, faq, newsletter, footer. The spec's `theme` (brand colours,
  heading font, logo) shows the theme-applier writing CSS vars onto the
  ripple-root. Full-width blocks sit in padded flex wrappers (a margin on a
  w-full block pushes it past the frame). The hero entrance and the CTA carry
  motion; newsletter signups land in an event log under the intro.
-->
<script lang="ts">
  import { Ripple } from '$lib/index.js';
  import type { RippleEvent } from '@ripple-ui/core';

  import Showcase from '../Showcase.svelte';

  // The newsletter widget emits the entered email on submit. With no `value`
  // on the `emit` action, the event's payload is that email.
  let signups = $state<string[]>([]);
  function handleEvent(event: RippleEvent) {
    if (event.type === 'emit' && event.name === 'subscribe') signups = [...signups, String(event.payload ?? '')];
  }

  // A padded, full-width wrapper for a block that should not touch the frame edge.
  const padded = (node: Record<string, unknown>) => ({ type: 'flex', props: { direction: 'column' }, class: 'px-6 py-12', children: [node] });

  // A single landing-page spec. The `theme` block drives white-label: the
  // theme-applier emits --primary / --ring / --ripple-font-heading / --ripple-logo
  // onto the ripple-root, so the navbar CTA, hero, and CTA band all pick up the
  // brand color with zero per-widget CSS.
  const landingSpec = {
    version: '1.0' as const,
    theme: {
      colors: {
        primary: 'oklch(0.55 0.17 256)',
        'primary-foreground': 'oklch(0.99 0 0)',
        ring: 'oklch(0.55 0.17 256)',
        accent: 'oklch(0.95 0.03 256)',
      },
      radius: '0.75rem',
      fonts: { heading: 'Fraunces, Georgia, serif' },
      logo: { src: '/logos/lumen.svg', alt: 'Lumen Solar' },
    },
    ui: {
      type: 'flex',
      props: { direction: 'column', gap: '0' },
      children: [
        // 1 ── navbar (sticky)
        {
          type: 'navbar',
          props: {
            brand: 'Lumen Solar',
            links: [
              { label: 'How it works', href: '#how' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Reviews', href: '#reviews' },
            ],
            cta: 'Get a quote',
            ctaHref: '#quote',
            sticky: true,
          },
        },

        // 2 ── marketing-hero: entrance motion (fade + rise)
        {
          type: 'marketing-hero',
          props: {
            eyebrow: 'Residential solar, done right',
            title: 'Power your home with the sun by next season',
            subtitle:
              'Lumen designs, permits and installs rooftop solar in weeks, not months. Flat pricing, a 25-year workmanship warranty, and one project lead from quote to switch-on.',
            cta: 'Get a free quote',
            ctaHref: '#quote',
            secondaryCta: 'See sample designs',
            secondaryCtaHref: '#how',
            align: 'center',
          },
          motion: { enter: { opacity: 0, y: 24 }, transition: { preset: 'snappy' } },
        },

        // 3 ── cta band, right under the hero as a conversion line
        padded({
          type: 'cta',
          props: {
            headline: 'See your roof’s solar potential in 60 seconds',
            subtext: 'Drop your address and we’ll estimate output, savings and payback, with no sales call.',
            button: 'Estimate my savings',
            href: '#quote',
            align: 'center',
          },
          // The primary conversion element: the one place a hover lift is earned.
          motion: { hover: { y: -2, scale: 1.01 }, transition: { preset: 'snappy' } },
        }),

        // 4 ── feature-grid
        {
          type: 'section',
          id: 'how',
          props: { title: 'Why homeowners pick Lumen', description: 'Everything handled end to end, by one team.' },
          class: 'px-6 py-12',
          children: [
            {
              type: 'feature-grid',
              props: {
                columns: 3,
                features: [
                  { title: 'Flat, honest pricing', description: 'One quote, locked in. No mid-project surprises or financing upsells.', icon: 'badge-dollar-sign' },
                  { title: 'Permits handled', description: 'We file every permit and schedule the inspections so you don’t chase paperwork.', icon: 'file-check' },
                  { title: 'Tier-1 panels', description: 'High-efficiency monocrystalline panels with a 25-year output warranty.', icon: 'sun' },
                  { title: 'Real-time app', description: 'Track production, savings, and CO₂ offset from your phone.', icon: 'smartphone' },
                  { title: 'Battery-ready', description: 'Add storage now or later; every install is wired for backup power.', icon: 'battery-charging' },
                  { title: 'Dedicated lead', description: 'One named project manager from first quote to switch-on.', icon: 'user-check' },
                ],
              },
            },
          ],
        },

        // 5 ── testimonial
        {
          type: 'section',
          id: 'reviews',
          props: { title: 'What our customers say' },
          class: 'px-6 py-12',
          children: [
            {
              type: 'testimonial',
              props: {
                quote:
                  'The crew showed up when they said, the panels went in over a weekend, and my first full month bill dropped 80%. The app makes it weirdly satisfying to watch.',
                author: 'Maya Okafor',
                role: 'Homeowner · Austin, TX',
              },
            },
          ],
        },

        // 6 ── logo-cloud
        {
          type: 'logo-cloud',
          props: {
            heading: 'Certified installer for the brands you trust',
            logos: [
              { src: '/logos/brightline.svg', alt: 'Brightline' },
              { src: '/logos/corvo.svg', alt: 'Corvo Energy' },
              { src: '/logos/helio-cells.svg', alt: 'Helio Cells' },
              { src: '/logos/stratum.svg', alt: 'Stratum Power' },
              { src: '/logos/northgrid.svg', alt: 'Northgrid' },
            ],
          },
          class: 'px-6 py-12 border-t border-border',
        },

        // 7 ── faq
        padded({
          type: 'faq',
          props: {
            title: 'Questions, answered',
            items: [
              { question: 'How long does an install take?', answer: 'Most roofs take one or two days on site, after about three weeks of design and permits.' },
              { question: 'What if my roof needs work first?', answer: 'We inspect it on the first visit and quote any repairs before you sign anything.' },
              { question: 'Can I add a battery later?', answer: 'Yes. Every install is wired for storage, so a battery is a half-day visit.' },
            ],
          },
        }),

        // 8 ── newsletter: emits the email on submit
        padded({
          type: 'newsletter',
          props: {
            heading: 'Get the solar-savings playbook',
            subtext: 'A short monthly note on incentives, rebates, and what they actually save you. No spam.',
            placeholder: 'you@email.com',
            button: 'Send it to me',
          },
          on_submit: { action: 'emit', target: 'subscribe' },
        }),

        // 9 ── footer
        {
          type: 'footer',
          props: {
            columns: [
              { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Careers', href: '#careers' }, { label: 'Service area', href: '#area' }] },
              { title: 'Product', links: [{ label: 'Panels', href: '#panels' }, { label: 'Batteries', href: '#batteries' }, { label: 'Financing', href: '#financing' }] },
              { title: 'Legal', links: [{ label: 'Privacy', href: '#privacy' }, { label: 'Terms', href: '#terms' }, { label: 'Warranty', href: '#warranty' }] },
            ],
            copyright: '© 2026 Lumen Solar, Inc.',
          },
        },
      ],
    },
  };
</script>

<Showcase slug="marketing">
  {#snippet intro()}
    <p>
      All nine marketing widgets (navbar, marketing-hero, cta, feature-grid, testimonial, logo-cloud, faq, newsletter
      and footer) composed in order into one landing page, rendered from a single JSON spec. The spec's
      <code>theme</code> block sets the brand colour, heading font and logo, so the navbar button, hero and CTA band
      pick up the brand with no per-widget styling.
    </p>
  {/snippet}

  <p class="event-log" aria-live="polite">
    Newsletter signups: {signups.length ? signups.join(', ') : 'none yet. Try the form near the bottom of the page.'}
  </p>

  <!-- The landing page renders edge to edge inside this framed surface. -->
  <div class="landing-frame">
    <Ripple spec={landingSpec} onEvent={handleEvent} />
  </div>
</Showcase>

<style>
  .landing-frame {
    margin-top: 16px;
    border: 1px solid var(--site-line);
    border-radius: var(--radius-card);
    overflow: hidden;
    background: var(--background);
    color: var(--foreground);
  }
</style>
