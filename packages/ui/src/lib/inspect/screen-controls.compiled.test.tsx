// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox } from '#ui/components/atoms/checkbox';
import { Switch } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { Disclosure } from '#ui/components/molecules/disclosure';
import { onScreen } from '#ui/testing';
import { act } from './screen-act';
import { snapshot } from './screen-snapshot';
import { screenText } from './screen-text';

afterEach(cleanup);

const settings = (
  <>
    <Switch defaultChecked />
    <Checkbox disabled />
    <Disclosure.Root>
      <Disclosure.Trigger>
        <Text>Avancé</Text>
      </Disclosure.Trigger>
    </Disclosure.Root>
  </>
);

describe('the controls of compiled kit components', () => {
  it('are read whatever the compiler made of their hooks', () => {
    render(onScreen(settings));

    const read = snapshot().map(({ ref, name, kind, state, actions }) => ({
      ref,
      name,
      kind,
      state,
      actions,
    }));

    expect(read).toEqual([
      {
        ref: 'c1',
        name: 'Switch',
        kind: 'switch',
        state: { checked: true },
        actions: ['setChecked', 'toggle'],
      },
      { ref: 'c2', name: 'Checkbox', kind: 'checkbox', state: { checked: false }, actions: [] },
      {
        ref: 'c3',
        name: 'Disclosure.Root',
        kind: 'disclosure',
        state: { open: false },
        actions: ['setOpen', 'toggle'],
      },
    ]);
  });

  it('change under a call, and the screen reads the new state', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(settings));

    const report = await act({
      steps: [
        { ref: 'c1', action: 'toggle' },
        { ref: 'c3', action: 'setOpen', args: [true] },
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.controls.map((control) => control.state)).toEqual([
      { checked: false },
      { open: true },
    ]);
    expect(screenText()).toMatch(
      /Switch \[c1\].*state: checked=false {2}actions: setChecked, toggle/,
    );
  });
});
