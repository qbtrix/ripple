// manifest/entries/notes.ts: the LLM-facing entry for the notes data widget.
// The model only seeds notes and suggested tags; the widget owns the writing
// line, inline #tags, tag filters, pin, edit in place and delete with undo.
// `value` ({ notes }) is the bound field; no events; nothing is stored.
import type { WidgetManifestEntry } from '../index.js';

export const notesEntry: WidgetManifestEntry = {
  type: 'notes',
  category: 'composite',
  description:
    'Notepad app: the visitor writes notes straight in, #tags become filter chips, pin, edit, delete with undo. Seed notes[{title, text, tags}]. Bind value.',
  props: {
    title: { type: 'string', required: false, description: 'e.g. "Ideas".' },
    notes: {
      type: 'Array<{ id?: string; title?: string; text: string; tags?: string[]; pinned?: boolean; color?: "plain" | "yellow" | "blue" | "green" | "pink" }>',
      required: false,
      description: 'Seed notes, plain text, up to 50 (title 80 chars, text 2000). Tags are single words without "#". Leave out for a blank pad.',
    },
    tags: { type: 'string[]', required: false, description: 'Suggested tags shown as chips, e.g. ["idea", "todo"].' },
    placeholder: { type: 'string', required: false, description: 'The writing line prompt. Default "Write a note…".' },
    sound: { type: 'boolean', required: false, description: 'A very quiet pop when a note is saved. Default true; false mutes this widget.' },
  },
  example: {
    type: 'notes',
    bind: '{state.notes}',
    props: {
      title: 'Ideas',
      tags: ['idea', 'todo', 'read'],
      notes: [
        { id: 'n1', title: 'Weekend market stall', text: 'Test a small batch of lemon cookies first.\nAsk Mia about the corner spot.', tags: ['idea'], pinned: true, color: 'yellow' },
        { id: 'n2', title: 'Books to pick up', text: 'The Overstory, A Psalm for the Wild-Built', tags: ['read'] },
      ],
    },
  },
};
