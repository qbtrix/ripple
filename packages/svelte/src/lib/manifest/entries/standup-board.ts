// manifest/entries/standup-board.ts: the LLM-facing entry for the
// standup-board data widget. The model writes one day's standup (people with
// yesterday, today and an optional blocker); the widget orders them blocked
// first, counts open blockers itself and lets the viewer resolve a blocker.
// `value` ({ resolved: person ids }) is the bound field; no events.
import type { WidgetManifestEntry } from '../index.js';

export const standupBoardEntry: WidgetManifestEntry = {
  type: 'standup-board',
  category: 'composite',
  description:
    'Team standup: people[{name, role, yesterday, today, blocker, status}]. Blocked people first, open blockers counted for you, the viewer can resolve one. Bind value.',
  props: {
    team: { type: 'string', required: false, description: 'Card title, e.g. "Payments team". Default "Standup".' },
    date: { type: 'string', required: false, description: 'ISO day "2026-10-14" or a short label.' },
    summary: {
      type: 'string',
      required: false,
      description: 'One sentence naming who is stuck. Leave out and the widget writes it from the people.',
    },
    people: {
      type: 'Array<{ name: string; role?: string; avatar?: string; yesterday?: string; today?: string; blocker?: string; status?: "blocked" | "on-track" | "done" | "away" }>',
      required: true,
      description:
        'Up to 20 people. Write blocker only when someone is stuck (it makes them blocked). status "away" for someone off today, with today like "Back Monday". Never write a blocker count.',
    },
  },
  example: {
    type: 'standup-board',
    bind: '{state.standup}',
    props: {
      team: 'Payments team',
      date: '2026-10-14',
      people: [
        {
          name: 'Lina Okafor',
          role: 'DevOps',
          yesterday: 'Set up the staging deploy pipeline',
          today: 'Run the first staging migration',
          blocker: 'Waiting on staging database credentials from the infra team.',
        },
        { name: 'Aarav Mehta', role: 'Backend', yesterday: 'Shipped the invoice export endpoint', today: 'Add pagination to the export API' },
        { name: 'Mei Tanaka', role: 'Frontend', yesterday: 'Built the settings page', today: 'Hook settings to the profile API' },
        { name: 'Priya Nair', role: 'QA', yesterday: 'Wrote refund test cases', today: 'Run the regression suite', status: 'done' },
        { name: 'Rui Santos', role: 'Design', today: 'Back Monday', status: 'away' },
      ],
    },
  },
};
