// manifest/entries/agenda.ts: the LLM-facing entry for the agenda data widget.
// The model writes the items and minutes; the widget works out start times,
// draws the time share bar, and lets the visitor tick, reorder, retime and run
// the meeting. `value` binds the edited items array.
import type { WidgetManifestEntry } from '../index.js';

export const agendaEntry: WidgetManifestEntry = {
  type: 'agenda',
  category: 'composite',
  description:
    'Meeting agenda app: start "HH:MM", items[{title, owner?, minutes, notes?}]; start times, time share bar, tick done, reorder, run mode with a countdown. Bind value.',
  props: {
    title: { type: 'string', required: true, description: 'e.g. "Weekly team sync".' },
    start: { type: 'string', required: false, description: 'Start time "HH:MM" (24 h). Without it items show offsets like +0:15.' },
    items: {
      type: 'Array<{ id?: string; title: string; owner?: string; minutes: number; notes?: string; done?: boolean }>',
      required: true,
      description: '1 to 30 items in running order. minutes 1 to 240. Keep notes to one short line.',
    },
    sound: { type: 'boolean', required: false, description: "A soft chime when the running item's time is up. Default true; false mutes this widget." },
  },
  example: {
    type: 'agenda',
    bind: '{state.agenda}',
    props: {
      title: 'Weekly team sync',
      start: '10:00',
      items: [
        { title: 'Wins from last week', owner: 'Maya Chen', minutes: 5 },
        { title: 'Metrics review', owner: 'Leo Park', minutes: 8, notes: 'Signups, churn, support load' },
        { title: 'Launch checklist', owner: 'Ana Ruiz', minutes: 10 },
        { title: 'Blockers', minutes: 5 },
        { title: 'Actions and owners', owner: 'Maya Chen', minutes: 2 },
      ],
    },
  },
};
