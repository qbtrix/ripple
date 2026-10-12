// duplicate-keys.test.ts — model-supplied lists with repeated values must not crash.
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
});
