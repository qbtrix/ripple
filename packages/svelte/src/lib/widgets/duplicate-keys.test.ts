// duplicate-keys.test.ts — model-supplied lists with repeated values or ids must not crash.
//
// Choice widgets key their {#each} by option value. A model that writes two
// options with the same value (live: a pizza crust segmented with Thin = 0 and
// Classic = 0) made Svelte throw `each_key_duplicate`, and the card showed
// "This widget hit an error". Each widget here gets a list with a repeated
// value and must render without throwing.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Ripple from '$lib/Ripple.svelte';

import Segmented from './input/Segmented.svelte';
import RadioGroup from './input/RadioGroup.svelte';
import CheckboxGroup from './input/CheckboxGroup.svelte';
import Select from './input/Select.svelte';
import Combobox from './input/Combobox.svelte';
import MultiSelect from './input/MultiSelect.svelte';
import ChoiceGrid from './input/ChoiceGrid.svelte';
import Tabs from './layout/Tabs.svelte';
import Accordion from './layout/Accordion.svelte';
import Kanban from './data/Kanban.svelte';
import TodoList from './interactive/TodoList.svelte';
import Tree from './data/Tree.svelte';
import Calendar from './data/Calendar.svelte';
import TreeTable from './data/TreeTable.svelte';
import DiffTable from './data/DiffTable.svelte';
import CommandPalette from './overlay/CommandPalette.svelte';
import FilterBar from './input/FilterBar.svelte';

// The live "Order pizza" card, verbatim from the model's turn.
const pizzaSpec = {
  ui: {
    type: 'card',
    props: { title: 'Build your pizza', subtitle: 'Sample menu, prices in USD', variant: 'outlined' },
    children: [
      {
        type: 'segmented',
        props: {
          label: 'Size',
          options: [
            { label: 'Small', value: 9.99 },
            { label: 'Medium', value: 12.99 },
            { label: 'Large', value: 15.99 }
          ]
        },
        bind: '{state.base}'
      },
      {
        type: 'segmented',
        props: {
          label: 'Crust',
          options: [
            { label: 'Thin', value: 0 },
            { label: 'Classic', value: 0 },
            { label: 'Stuffed', value: 3 }
          ]
        },
        bind: '{state.crust}'
      },
      {
        type: 'checkbox-group',
        props: {
          label: 'Toppings (1.50 each)',
          options: [
            { value: 'pepperoni', label: 'Pepperoni' },
            { value: 'mushrooms', label: 'Mushrooms' },
            { value: 'onions', label: 'Onions' },
            { value: 'peppers', label: 'Green peppers' },
            { value: 'olives', label: 'Olives' },
            { value: 'extra-cheese', label: 'Extra cheese' }
          ]
        },
        bind: '{state.toppings}'
      },
      {
        type: 'grid',
        props: { columns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
        children: [
          {
            type: 'stat',
            props: {
              label: 'Total',
              value: '{state.base + state.crust + state.toppings.length * 1.5}',
              format: 'currency',
              currency: 'USD'
            }
          }
        ]
      }
    ]
  },
  state: { base: 12.99, crust: 0, toppings: ['mushrooms', 'onions'] }
};

describe('duplicate list keys', () => {
  it('renders the live pizza card without an error box', () => {
    const { container } = render(Ripple, { props: { spec: pizzaSpec } });
    expect(container.textContent).not.toContain('This widget hit an error');
    expect(container.textContent).toContain('Toppings');
    expect(container.textContent).toContain('Stuffed');
  });

  const dupOptions = [
    { value: 'a', label: 'Alpha' },
    { value: 'a', label: 'Alpha again' },
    { value: 'b', label: 'Beta' }
  ];

  const cases: [string, any, Record<string, unknown>][] = [
    ['segmented', Segmented, { options: dupOptions, value: 'a' }],
    ['segmented multiple', Segmented, { options: dupOptions, value: ['a', 'a'], multiple: true }],
    ['radio-group', RadioGroup, { options: dupOptions, value: 'a' }],
    ['radio-group 1 vs "1"', RadioGroup, { options: [1, '1', 2], value: '1' }],
    ['checkbox-group', CheckboxGroup, { options: dupOptions, value: ['a'] }],
    ['select', Select, { options: dupOptions, value: 'a' }],
    ['combobox', Combobox, { options: dupOptions, value: 'a' }],
    ['multi-select', MultiSelect, { options: dupOptions, value: ['a', 'a', 'b'] }],
    ['choice-grid', ChoiceGrid, { options: dupOptions, value: 'a' }],
    ['tabs', Tabs, { tabs: ['One', 'One', 'Two'] }],
    ['accordion', Accordion, { items: [{ value: 'x', title: 'X' }, { value: 'x', title: 'X2' }] }]
  ];

  for (const [name, Component, props] of cases) {
    it(`${name} survives duplicate values`, () => {
      const { container } = render(Component, { props });
      expect(container.textContent).toMatch(/\S/);
    });
  }

  // Lists of things (cards, rows, nodes, children) keep every item: a repeated
  // id gets a unique each-key, and both items render.
  const both = (text: string, a: string, b: string) => {
    expect(text).toContain(a);
    expect(text).toContain(b);
  };
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const kept: [string, any, Record<string, unknown>, string, string][] = [
    ['kanban columns', Kanban, { columns: [{ id: 'todo', title: 'First col' }, { id: 'todo', title: 'Second col' }], value: [] }, 'First col', 'Second col'],
    ['kanban cards', Kanban, { columns: [{ id: 'todo', title: 'To do' }], value: [{ id: 'c', status: 'todo', title: 'Card one' }, { id: 'c', status: 'todo', title: 'Card two' }] }, 'Card one', 'Card two'],
    ['todo-list', TodoList, { items: [{ id: 't', text: 'Buy milk', done: false }, { id: 't', text: 'Walk dog', done: false }] }, 'Buy milk', 'Walk dog'],
    ['tree', Tree, { nodes: [{ id: 'n', label: 'Node one' }, { id: 'n', label: 'Node two' }] }, 'Node one', 'Node two'],
    ['calendar events', Calendar, { value: iso, events: [{ id: 'e', title: 'Event one', start: iso }, { id: 'e', title: 'Event two', start: iso }] }, 'Event one', 'Event two'],
    ['tree-table columns', TreeTable, { columns: [{ key: 'name', label: 'Col A' }, { key: 'name', label: 'Col B' }], rows: [{ id: 1, name: 'x' }] }, 'Col A', 'Col B'],
    ['diff-table', DiffTable, { columns: [{ key: 'item', label: 'Item' }, { key: 'item', label: 'Item again' }], rows: [{ key: 'r', cells: { item: 'Row one' } }, { key: 'r', cells: { item: 'Row two' } }] }, 'Row one', 'Row two'],
    ['command-palette', CommandPalette, { value: true, commands: [{ id: 'x', label: 'Cmd one' }, { id: 'x', label: 'Cmd two' }] }, 'Cmd one', 'Cmd two'],
    ['filter-bar', FilterBar, { options: [{ key: 'k', label: 'Opt one' }], value: [{ key: 'k', label: 'Active one' }, { key: 'k', label: 'Active two' }] }, 'Active one', 'Active two']
  ];

  for (const [name, Component, props, a, b] of kept) {
    it(`${name} keeps both items with a repeated id`, () => {
      render(Component, { props });
      both(document.body.textContent ?? '', a, b);
    });
  }

  it('a card with two children sharing an id renders both', () => {
    const spec = {
      ui: {
        type: 'card',
        children: [
          { id: 'dup', type: 'text', props: { text: 'Child one' } },
          { id: 'dup', type: 'text', props: { text: 'Child two' } }
        ]
      }
    };
    const { container } = render(Ripple, { props: { spec } });
    expect(container.textContent).not.toContain('This widget hit an error');
    both(container.textContent ?? '', 'Child one', 'Child two');
  });
});
