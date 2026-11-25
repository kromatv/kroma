import { describe, expect, it } from 'vitest';
import { restOf } from './control-props';
import { defineControl, typed } from './define-control';

const select = defineControl('select', {
  state: { open: false, value: '' },
  options: { multiple: false },
});

const defineClashing = () =>
  defineControl('clashing', {
    state: { open: false },
    actions: { setOpen: () => ({ open: true }) },
  });

describe('a definition', () => {
  it('names the three props of each state key', () => {
    expect(select.keyOf.get('open')).toEqual({
      key: 'open',
      from: 'defaultOpen',
      change: 'onOpenChange',
      setter: 'setOpen',
    });
  });

  it('owns the props of its state and of its options', () => {
    expect([...select.owned]).toEqual([
      'open',
      'defaultOpen',
      'onOpenChange',
      'value',
      'defaultValue',
      'onValueChange',
      'multiple',
    ]);
  });

  it('has no options and no actions when it declares none', () => {
    const plain = defineControl('plain', { state: { open: false } });

    expect(plain.options).toEqual({});
    expect(plain.actions).toEqual({});
  });

  it('starts a key from the value `typed` was given', () => {
    const chart = defineControl('chart', { state: { active: typed<number | null>(null) } });

    expect(chart.state).toEqual({ active: null });
  });

  it('lists the reasons its setters give', () => {
    const menu = defineControl('menu', { state: { open: false }, reasons: ['trigger', 'back'] });

    expect(menu.reasons).toEqual(['trigger', 'back']);
  });

  it('lists no reason when it declares none', () => {
    const plain = defineControl('plain', { state: { open: false } });

    expect(plain.reasons).toEqual([]);
  });

  it('refuses an action named like one of its setters', () => {
    expect(defineClashing).toThrow('The clashing control names "setOpen" twice');
  });
});

describe('an action', () => {
  it('is a plain function of the state and the options', () => {
    const counter = defineControl('counter', {
      state: { value: 0 },
      options: { step: 1, max: 10 },
      actions: { increment: ({ value, step, max }) => ({ value: Math.min(max, value + step) }) },
    });

    const changes = counter.actions.increment({ value: 8, step: 5, max: 10 });

    expect(changes).toEqual({ value: 10 });
  });
});

describe('the props a control does not read', () => {
  it('are everything but the ones its definition owns', () => {
    const props = { open: true, onValueChange: () => undefined, multiple: true, label: 'Audio' };

    expect(restOf(select, props)).toEqual({ label: 'Audio' });
  });
});
