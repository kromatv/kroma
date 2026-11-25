import { describe, expect, it } from 'vitest';
import { actionsNow, changes, dryRun, isDisabled } from './control-calls';
import { counterOf } from './control.fixtures';

const at = (value: number) => counterOf({ defaultValue: value });

describe('a call tried without writing', () => {
  it('says what a setter would write', () => {
    expect(dryRun(at(0), { action: 'setValue', args: [4] })).toEqual({ value: 4 });
  });

  it('says what an action would write with its arguments', () => {
    expect(dryRun(at(0), { action: 'jump', args: [7] })).toEqual({ value: 7 });
  });

  it('leaves the control as it was', () => {
    const control = at(2);

    dryRun(control, { action: 'increment', args: [] });

    expect(control.state()).toEqual({ value: 2 });
  });

  it('refuses a value of another kind than the key holds', () => {
    expect(dryRun(at(0), { action: 'setValue', args: ['four'] })).toBe(
      'value holds a number, and "four" is not one',
    );
  });

  it('refuses what an action would write when its argument is of another kind', () => {
    expect(dryRun(at(0), { action: 'jump', args: [null] })).toBe(
      'value holds a number, and null is not one',
    );
  });

  it('refuses a setter given no value or several', () => {
    expect(dryRun(at(0), { action: 'setValue', args: [] })).toBe(
      'it takes one value, the value to hold',
    );
  });

  it('refuses more arguments than the action takes', () => {
    expect(dryRun(at(0), { action: 'increment', args: [2] })).toBe('it takes no argument');
    expect(dryRun(at(0), { action: 'jump', args: [1, 2] })).toBe('it takes at most 1 arguments');
  });

  it('refuses an action the control does not have and lists what it takes', () => {
    expect(dryRun(at(0), { action: 'press', args: [] })).toBe(
      'the counter has no such action. It takes: setValue, increment, reset, jump, halve',
    );
  });

  it('says what an action threw', () => {
    expect(dryRun(at(3), { action: 'halve', args: [] })).toBe('it threw "odd"');
  });
});

describe('what a call may ask of a control now', () => {
  it('is its setters, the actions that take arguments and those that would change it', () => {
    expect(actionsNow(at(4))).toEqual(['setValue', 'increment', 'reset', 'jump', 'halve']);
  });

  it('leaves out an action that would change nothing', () => {
    expect(actionsNow(at(0))).toEqual(['setValue', 'increment', 'jump']);
  });

  it('keeps an action that cannot be tried', () => {
    expect(actionsNow(at(3))).toContain('halve');
  });

  it('is nothing while the component is disabled', () => {
    const control = counterOf({ disabled: true });

    expect(isDisabled(control)).toBe(true);
    expect(actionsNow(control)).toEqual([]);
  });
});

describe('a patch', () => {
  it('changes a control that holds another value', () => {
    expect(changes(at(1), { value: 2 })).toBe(true);
  });

  it('changes nothing on a control that already holds it', () => {
    expect(changes(at(2), { value: 2 })).toBe(false);
  });
});
