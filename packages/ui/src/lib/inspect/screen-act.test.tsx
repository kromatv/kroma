// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetails } from '../control';
import { Counter, Languages, mount } from './control.fixtures';
import { act, MAX_STEPS } from './screen-act';
import { snapshot } from './screen-snapshot';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(cleanup);

const call = (...steps: { ref: string; action: string; args?: unknown[] }[]) => act({ steps });

const refuse = (_next: number, details: ChangeDetails) => details.cancel();

const fail = () => {
  throw new Error('offline');
};

function Owned() {
  const [value, setValue] = useState(1);
  return <Counter value={value} onValueChange={setValue} />;
}

describe('a call on a control', () => {
  it('runs a setter and reports the control as it reads afterwards', async () => {
    mount(<Counter />);

    const report = await call({ ref: 'c1', action: 'setValue', args: [4] });

    expect(report).toMatchObject({
      ok: true,
      steps: [{ step: 0, ref: 'c1', action: 'setValue', outcome: 'changed' }],
      controls: [{ ref: 'c1', name: 'Counter', state: { value: 4 } }],
    });
    expect(screen.getByRole('status').textContent).toBe('4');
  });

  it('runs an action with the arguments it takes', async () => {
    mount(<Counter />);

    const report = await call({ ref: 'c1', action: 'jump', args: [9] });

    expect(report.controls[0]?.state).toEqual({ value: 9 });
  });

  it('runs its steps in order, each on what the one before left', async () => {
    mount(<Counter step={3} />);

    const report = await call(
      { ref: 'c1', action: 'increment' },
      { ref: 'c1', action: 'increment' },
    );

    expect(report.steps.map((step) => step.outcome)).toEqual(['changed', 'changed']);
    expect(report.controls).toHaveLength(1);
    expect(report.controls[0]?.state).toEqual({ value: 6 });
  });

  it('signs the change as a tool’s for the app’s callback', async () => {
    const sources: string[] = [];
    mount(<Counter onValueChange={(_next, details) => sources.push(details.source)} />);

    await call({ ref: 'c1', action: 'increment' });

    expect(sources).toEqual(['tool']);
  });

  it('asks the app for a key it owns and reads what the app answered', async () => {
    mount(<Owned />);

    const report = await call({ ref: 'c1', action: 'setValue', args: [8] });

    expect(report.controls[0]?.state).toEqual({ value: 8 });
  });

  it('reports the values of a list it set', async () => {
    mount(<Languages defaultValue={['fr']} />);

    const report = await call({ ref: 'c1', action: 'setValue', args: [['fr', 'en']] });

    expect(report.controls[0]?.state).toEqual({ value: ['fr', 'en'] });
    expect(screen.getByRole('status').textContent).toBe('fr,en');
  });

  it('says so when the control already holds the value, and asks nobody', async () => {
    const onValueChange = vi.fn();
    mount(<Counter defaultValue={2} onValueChange={onValueChange} />);

    const report = await call({ ref: 'c1', action: 'setValue', args: [2] });

    expect(report.steps[0]?.outcome).toBe('unchanged');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('says so when the app cancels the change', async () => {
    mount(<Counter onValueChange={refuse} />);

    const report = await call({ ref: 'c1', action: 'increment' });

    expect(report.steps[0]?.outcome).toBe('canceled');
    expect(report.controls[0]?.state).toEqual({ value: 0 });
  });
});

describe('a call that cannot run', () => {
  it('leaves a disabled control alone', async () => {
    mount(<Counter disabled />);

    const report = await call({ ref: 'c1', action: 'increment' });

    expect(report.error).toEqual({ step: 0, message: 'c1.increment: the counter is disabled.' });
    expect(snapshot()[0]?.state).toEqual({ value: 0 });
  });

  it('refuses a value of another kind and says which kind the key holds', async () => {
    mount(<Counter />);

    const report = await call({ ref: 'c1', action: 'setValue', args: ['4'] });

    expect(report.error?.message).toBe('c1.setValue: value holds a number, and "4" is not one.');
    expect(snapshot()[0]?.state).toEqual({ value: 0 });
  });

  it('names what the control takes when it has no such action', async () => {
    mount(<Counter />);

    const report = await call({ ref: 'c1', action: 'press' });

    expect(report.error?.message).toBe(
      'c1.press: the counter has no such action. It takes: setValue, increment, reset, jump, halve.',
    );
  });

  it('says a ref names nothing that is mounted', async () => {
    mount(<Counter />);

    const report = await call({ ref: 'c7', action: 'increment' });

    expect(report).toEqual({
      ok: false,
      steps: [],
      controls: [],
      error: {
        step: 0,
        message: 'c7: no such control is mounted. Read the screen again for its refs.',
      },
    });
  });

  it('stops at the first step that fails and keeps the ones before it', async () => {
    mount(<Counter />);

    const report = await call(
      { ref: 'c1', action: 'increment' },
      { ref: 'c1', action: 'press' },
      { ref: 'c1', action: 'increment' },
    );

    expect(report.ok).toBe(false);
    expect(report.steps).toHaveLength(1);
    expect(report.error?.step).toBe(1);
    expect(report.controls[0]?.state).toEqual({ value: 1 });
  });

  it('reports what the app’s callback threw', async () => {
    mount(<Counter onValueChange={fail} />);

    const report = await call({ ref: 'c1', action: 'increment' });

    expect(report.error?.message).toBe('c1.increment: the app threw "offline".');
  });

  it('refuses anything that is not a list of steps, and shows one', async () => {
    const report = await act({ ref: 'c1' });

    expect(report.ok).toBe(false);
    expect(report.error?.step).toBeUndefined();
    expect(report.error?.message).toContain('{ "steps": [{ "ref": "c4"');
  });

  it('refuses more steps than one call runs', async () => {
    const steps = Array.from({ length: MAX_STEPS + 1 }, () => ({ ref: 'c1', action: 'reset' }));

    const report = await act({ steps });

    expect(report.error?.message).toContain('steps');
  });
});
