// widgets/composite/PipelineDashboard.test.ts: the pipeline-dashboard card in
// jsdom: the designed empty state, messy data (brief spec 05) degrading
// visibly instead of throwing, conversion only without a funnel (spec 06),
// the list caps with their Show more buttons, and id forwarding.
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import PipelineDashboard from './PipelineDashboard.svelte';
import { pipelineDashboardEntry } from '$lib/manifest/entries/pipeline-dashboard.js';

afterEach(cleanup);

const messy = {
 "title": "**Pipeline** check-in",
 "period": "",
 "quota": {
  "current": "$1,200,000",
  "target": 0,
  "currency": "usd"
 },
 "funnel": {
  "stages": [
   {
    "label": "Leads",
    "value": "1,240"
   },
   {
    "label": "Qualified",
    "value": 480
   },
   {
    "label": "Discovery"
   },
   {
    "label": "",
    "value": 120
   },
   {
    "label": "Closed won",
    "value": -5
   }
  ]
 },
 "conversion": [
  {
   "from": "Leads",
   "to": "Qualified",
   "rate": 0.387
  },
  {
   "from": "Qualified",
   "to": "Discovery",
   "rate": "66.7%"
  },
  {
   "from": "Discovery",
   "to": "Proposal",
   "rate": 140
  },
  {
   "from": "Proposal",
   "rate": 51
  }
 ],
 "leaderboard": {
  "items": [
   {
    "name": "Rhea Castellano",
    "value": 420000,
    "position": 2,
    "avatar": "javascript:alert(1)"
   },
   {
    "name": "Odo Brandt",
    "value": "$380k",
    "position": 2,
    "avatar": "https://example.com/avatars/missing-odo.png"
   },
   {
    "name": "",
    "value": "$310k",
    "delta": "-$12k"
   },
   {
    "name": "Lena Achterberg"
   },
   {
    "name": "Pim Vos",
    "value": "$90k",
    "position": 1
   }
  ]
 },
 "deals": {
  "columns": [
   {
    "key": "name",
    "label": "Deal"
   },
   {
    "key": "amount",
    "label": "Amount",
    "align": "right"
   },
   {
    "key": "stage",
    "label": "Stage"
   },
   {
    "key": "notes",
    "label": "Notes"
   }
  ],
  "rows": [
   {
    "name": "Fernhill Robotics pilot",
    "value": "$84k",
    "stage": "Proposal",
    "notes": null
   },
   {
    "name": "**Tidewater** renewal",
    "amount": 48000,
    "stage": {
     "id": 3,
     "label": "Negotiation"
    },
    "notes": [
     "call Tue",
     "send MSA"
    ]
   },
   {
    "amount": "$12k",
    "stage": "Qualified"
   },
   {}
  ]
 },
 "ticker": [
  {
   "time": "2m ago",
   "label": "Closed: Fernhill Robotics pilot",
   "actor": "Rhea Castellano",
   "icon": "not-a-real-icon"
  },
  {
   "label": "Lead qualified: Larkspur Media"
  },
  {
   "time": "1h ago",
   "label": "",
   "actor": "Odo Brandt",
   "icon": "phone"
  },
  {
   "time": "3h ago",
   "label": "- Proposal sent: **Mossbank Credit Union**",
   "icon": "file-text"
  }
 ]
};
const hiring = {
 "title": "Hiring pipeline",
 "subtitle": "Engineering and design roles",
 "period": "H2 2026",
 "quota": {
  "label": "Hires",
  "current": 14,
  "target": 20,
  "period": "H2 hiring plan, 11 weeks left"
 },
 "conversion": [
  {
   "from": "Applied",
   "to": "Screened",
   "rate": 0.225
  },
  {
   "from": "Screened",
   "to": "Onsite",
   "rate": 41
  },
  {
   "from": "Onsite",
   "to": "Offer",
   "rate": "28.6%"
  },
  {
   "from": "Offer",
   "to": "Accepted",
   "rate": 83.3
  }
 ],
 "leaderboard": {
  "title": "Top referrers",
  "items": [
   {
    "name": "Sunniva Halvorsen",
    "value": 6,
    "sublabel": "2 hired"
   },
   {
    "name": "Kofi Mensah",
    "value": 4,
    "sublabel": "1 hired"
   },
   {
    "name": "Lucia Ferreira",
    "value": 3
   },
   {
    "name": "Arjun Mehta",
    "value": 3,
    "sublabel": "1 hired"
   }
  ]
 },
 "deals": {
  "title": "Candidates in final rounds",
  "columns": [
   {
    "key": "name",
    "label": "Candidate"
   },
   {
    "key": "role",
    "label": "Role"
   },
   {
    "key": "stage",
    "label": "Stage"
   },
   {
    "key": "days",
    "label": "Days in stage",
    "align": "right"
   }
  ],
  "rows": [
   {
    "name": "Noor Haddad",
    "role": "Staff engineer",
    "stage": "Offer",
    "days": 2
   },
   {
    "name": "Emil Sandberg",
    "role": "Product designer",
    "stage": "Onsite",
    "days": 5
   },
   {
    "name": "Thandiwe Nkosi",
    "role": "Engineering manager",
    "stage": "Onsite",
    "days": 9
   },
   {
    "name": "Mateo Rinaldi",
    "role": "Data engineer",
    "stage": "Reference check",
    "days": 1
   }
  ]
 },
 "ticker": [
  {
   "time": "10m ago",
   "label": "Offer accepted: Platform engineer",
   "actor": "Kofi Mensah",
   "icon": "check-circle-2"
  },
  {
   "time": "2h ago",
   "label": "Onsite scheduled: Emil Sandberg",
   "actor": "Lucia Ferreira",
   "icon": "calendar"
  },
  {
   "time": "Yesterday",
   "label": "Candidate withdrew: Backend engineer",
   "icon": "x-circle"
  }
 ]
};
const text = (c: Element) => c.textContent!.replace(/\s+/g, ' ');

it('spec 07: every section empty renders one designed line and no headings', () => {
	const { container } = render(PipelineDashboard, {
		props: {
			title: 'Sales pipeline',
			period: 'Q1 2027',
			funnel: { title: 'Pipeline funnel', stages: [] },
			conversion: [],
			leaderboard: { title: 'Top reps', items: [] },
			deals: { title: 'Active deals', columns: [], rows: [] },
			ticker: []
		}
	});
	expect(screen.getByText('No pipeline data yet')).toBeTruthy();
	expect(container.querySelectorAll('h4, table, section')).toHaveLength(0);
	expect(text(container)).not.toContain('No stages to show');
});

it('spec 05: messy data degrades visibly, never throws', () => {
	const { container } = render(PipelineDashboard, { props: messy as never });
	const t = text(container);
	expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Pipeline check-in');
	expect(t).toContain('$1.2M');
	expect(container.querySelector('[role="progressbar"]')).toBeNull();
	expect(container.querySelector('[data-slot="conversion"]')).toBeNull();
	expect(t).toContain('Unnamed');
	expect(t).toContain('n/a');
	expect(t).toContain('Negotiation');
	expect(t).toContain('call Tue, send MSA');
	expect(t).toContain('Proposal sent: Mossbank Credit Union');
	expect(t).not.toMatch(/\[object Object\]|NaN|Infinity|undefined|\*\*|"id"/);
	expect(container.querySelectorAll('[data-slot="event-icon"] span.rounded-full').length).toBeGreaterThan(0);
	const ranks = [...container.querySelectorAll('[data-slot="leaderboard"] li')].map((li) => li.getAttribute('aria-label')!.split(',')[0]);
	expect(ranks).toEqual(['1', '2', '3', '4', '5']);
});

it('spec 06: conversion without a funnel, counts without a currency', () => {
	const { container } = render(PipelineDashboard, { props: hiring as never });
	const conv = container.querySelector('[data-slot="conversion"]')!;
	expect(text(conv)).toContain('22.5%');
	expect(text(conv)).toContain('28.6%');
	expect(conv.querySelector('.text-ripple-accent-text')!.textContent).toBe('22.5%');
	const quota = text(container.querySelector('[data-slot="quota"]')!);
	expect(quota).toContain('14 of 20');
	expect(quota).not.toContain('$');
});

it('spec 01: caps lists and expands them in place', async () => {
	const { container } = render(PipelineDashboard, { props: { ...(pipelineDashboardEntry.example!.props as object), id: 'pd' } });
	const root = container.querySelector('#pd')!;
	expect(root.getAttribute('data-ripple-node')).toBe('pd');
	expect(container.querySelector('[data-slot="conversion"]')).toBeNull();
	const reps = () => container.querySelectorAll('[data-slot="leaderboard"] li').length;
	expect(reps()).toBe(5);
	const btn = screen.getByRole('button', { name: 'Show 5 more' });
	expect(btn.getAttribute('aria-expanded')).toBe('false');
	await fireEvent.click(btn);
	expect(reps()).toBe(10);
	expect(btn.getAttribute('aria-expanded')).toBe('true');
	expect(container.querySelectorAll('[data-slot="activity"] li')).toHaveLength(4);
	expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe('$1.8M of $2.5M, 73 percent');
	expect(text(container)).toContain('$680K to go');
});
