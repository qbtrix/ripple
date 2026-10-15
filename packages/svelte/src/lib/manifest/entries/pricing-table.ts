// manifest/entries/pricing-table.ts: the LLM-facing entry for pricing-table.
// A CTA fires the tier's own `actions`, else the node's `on_select`.
import type { WidgetManifestEntry } from '../index.js';

export const pricingTableEntry: WidgetManifestEntry = {
  type: 'pricing-table',
  category: 'vertical',
  description: 'Multi-tier pricing comparison cards with feature checklists, popular badge, and CTAs.',
  props: {
    tiers: { type: 'Array<{ id: string; name: string; price: string | number; period?: string; description?: string; features?: Array<string | { label: string; included?: boolean }>; cta?: string; popular?: boolean; actions?: EventAction | EventAction[] }>', required: true, description: 'Pricing tiers, 1 to 4 in a row; a narrow card stacks them. `period` is "month", not "/month". A tier\'s `actions` fire on its CTA instead of on_select.' },
    currency: { type: 'string', required: false, description: 'ISO 4217 code for numeric prices ("EUR", "USD"), or a symbol written as is. Default "$".' },
  },
  events: {
    on_select: {
      type: 'EventAction | EventAction[]',
      required: false,
      description: 'Fires with { id, name } when the visitor clicks a tier\'s CTA (a tier with its own `actions` fires those instead).',
    },
  },
  example: {
    type: 'pricing-table',
    props: {
      currency: 'USD',
      tiers: [
        { id: 'free', name: 'Free', price: 0, period: 'month', features: [{ label: 'Up to 3 projects', included: true }, { label: 'Priority support', included: false }], cta: 'Get started' },
        { id: 'pro', name: 'Pro', price: 99, period: 'month', features: [{ label: 'Unlimited projects', included: true }, { label: 'Priority support', included: true }], cta: 'Start trial', popular: true },
        { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: [{ label: 'Unlimited projects', included: true }, { label: 'SSO', included: true }], cta: 'Contact sales' },
      ],
    },
  },
};
