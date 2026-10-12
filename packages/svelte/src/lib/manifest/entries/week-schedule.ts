// manifest/entries/week-schedule.ts: the LLM-facing entry for the
// week-schedule data widget. The model writes the events; the widget lays
// them on a days-by-hours grid (a day list on narrow cards), sets overlaps
// side by side and shows details on press. `value` binds the selected event id.
import type { WidgetManifestEntry } from '../index.js';

export const weekScheduleEntry: WidgetManifestEntry = {
  type: 'week-schedule',
  category: 'composite',
  description:
    'Week calendar app: events[{day, start "HH:MM", end, title, place?, color?}] as blocks on a days-by-hours grid; overlaps side by side, details on press. Bind value.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "My week".' },
    startHour: { type: 'number', required: false, description: 'First hour shown, 0 to 23. Default 7.' },
    endHour: { type: 'number', required: false, description: 'Last hour shown, 1 to 24. Default 21.' },
    days: { type: 'string[]', required: false, description: 'Column names. Default ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]. An event day matches by name.' },
    events: {
      type: 'Array<{ id?: string; day: string; start: string; end: string; title: string; place?: string; color?: "blue" | "green" | "orange" | "purple" | "pink" | "teal" | "red" | "yellow" | "gray" }>',
      required: true,
      description: 'Up to 60 events. start and end are "HH:MM" (24 h). Same color for the same kind of event; leave it out to colour by title.',
    },
  },
  example: {
    type: 'week-schedule',
    bind: '{state.selected}',
    props: {
      title: 'My week',
      startHour: 7,
      endHour: 21,
      events: [
        { day: 'Mon', start: '09:00', end: '12:30', title: 'Deep work', color: 'blue' },
        { day: 'Mon', start: '18:00', end: '19:00', title: 'Gym', place: 'Studio 4', color: 'green' },
        { day: 'Tue', start: '09:00', end: '17:00', title: 'Office', color: 'gray' },
        { day: 'Wed', start: '18:00', end: '19:00', title: 'Gym', place: 'Studio 4', color: 'green' },
        { day: 'Thu', start: '10:00', end: '11:00', title: 'Design review', color: 'purple' },
        { day: 'Thu', start: '10:30', end: '11:30', title: '1:1 with Sam', color: 'orange' },
        { day: 'Sun', start: '19:00', end: '21:00', title: 'Family dinner', place: 'Home', color: 'pink' },
      ],
    },
  },
};
