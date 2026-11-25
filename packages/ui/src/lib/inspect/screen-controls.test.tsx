// @vitest-environment jsdom

import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { nameComponent } from '../component-names';
import { defineControl, useControl } from '../control';
import { Counter, mount, Tally } from './control.fixtures';
import { describeScreen } from './describe-screen';
import { find } from './inspect.fixtures';
import { snapshot } from './screen-snapshot';
import { screenText } from './screen-text';

afterEach(cleanup);

const code = defineControl('code', { state: { value: '' } });

function PinInput(props: Readonly<{ defaultValue?: string }>) {
  const [{ value }] = useControl(code, props);
  return <output>{value.length}</output>;
}

nameComponent(PinInput, 'PinInput');

describe('the controls on screen', () => {
  it('are listed in document order with their state and what they take now', () => {
    mount(
      <>
        <Counter defaultValue={2} />
        <Counter step={5} />
      </>,
    );

    expect(snapshot()).toEqual([
      {
        ref: 'c1',
        name: 'Counter',
        kind: 'counter',
        state: { value: 2 },
        actions: ['setValue', 'increment', 'reset', 'jump', 'halve'],
        box: { x: 0, y: 0, width: 0, height: 0 },
      },
      {
        ref: 'c2',
        name: 'Counter',
        kind: 'counter',
        state: { value: 0 },
        actions: ['setValue', 'increment', 'jump'],
        box: { x: 0, y: 0, width: 0, height: 0 },
      },
    ]);
  });

  it('keep their ref from one read to the next', () => {
    const { rerender } = mount(<Counter key="kept" />);
    const [before] = snapshot();

    rerender(
      <>
        <Counter key="new" />
        <Counter key="kept" />
      </>,
    );

    expect(snapshot().map((control) => control.ref)).toEqual(['c2', before?.ref]);
  });

  it('are on the node of the component that runs them', () => {
    mount(<Counter defaultValue={3} />);

    expect(find(describeScreen().nodes, 'Counter')?.control).toMatchObject({
      ref: 'c1',
      state: { value: 3 },
    });
  });

  it('name a component the kit did not name after their kind', () => {
    mount(<Tally />);

    expect(snapshot().map((control) => control.name)).toEqual(['counter']);
  });

  it('take nothing while their component is disabled', () => {
    mount(<Counter disabled />);

    expect(snapshot()[0]?.actions).toEqual([]);
  });

  it('read the value the app gives a key it owns', () => {
    const { rerender } = mount(<Counter value={1} />);

    rerender(<Counter value={6} />);

    expect(snapshot()[0]?.state).toEqual({ value: 6 });
  });

  it('are numbered apart in a second tree', () => {
    mount(<Counter />);
    mount(<Counter />);

    expect(snapshot().map((control) => control.ref)).toEqual(['c1', '2:c1']);
  });

  it('are absent from a screen that has none', () => {
    mount(<output>nothing</output>);

    expect(snapshot()).toEqual([]);
  });
});

describe('a control in the text of a screen', () => {
  it('has its ref after its name and ends with its state and its actions', () => {
    mount(<Counter step={5} />);

    expect(screenText()).toBe(
      'Counter [c1]  0,0 0x0  step=5  state: value=0  actions: setValue, increment, jump',
    );
  });

  it('does not repeat among the props a key the app owns', () => {
    mount(<Counter value={4} disabled />);

    expect(screenText()).toBe('Counter [c1]  0,0 0x0  disabled  state: value=4');
  });
});

describe('what a control holds', () => {
  it('is not reported when its component hides what is typed', () => {
    mount(<PinInput defaultValue="1234" />);

    expect(snapshot()[0]?.state).toEqual({ value: '[secret]' });
    expect(screenText()).toContain('state: value="[secret]"');
  });
});
