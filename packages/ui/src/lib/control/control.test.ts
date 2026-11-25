import { describe, expect, it, vi } from 'vitest';
import { createControl } from './control';
import { type ControlChange, createControlEngine } from './control-engine';
import type { ChangeDetails } from './control-types';
import { defineControl } from './define-control';

const counter = defineControl('counter', {
  state: { value: 0 },
  options: { step: 1 },
  actions: {
    increment: ({ value, step }) => ({ value: value + step }),
    jump: (_now, to: number) => ({ value: to }),
  },
});

const refuse = (_next: number, details: ChangeDetails) => details.cancel();

describe('a control that runs itself', () => {
  it('starts from the value its definition declares', () => {
    const control = createControl(counter, {}, null);

    expect(control.state()).toEqual({ value: 0 });
  });

  it('starts from the default the component was given', () => {
    const control = createControl(counter, { defaultValue: 4 }, null);

    expect(control.state()).toEqual({ value: 4 });
  });

  it('holds the new value as soon as it is set', () => {
    const control = createControl(counter, {}, null);

    const changed = control.actions.setValue(3);

    expect(changed).toBe(true);
    expect(control.state()).toEqual({ value: 3 });
  });

  it('wakes its subscribers once per change', () => {
    const control = createControl(counter, {}, null);
    const listener = vi.fn();
    control.subscribe(listener);

    control.actions.setValue(3);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('leaves a subscriber alone once it has left', () => {
    const control = createControl(counter, {}, null);
    const listener = vi.fn();
    const leave = control.subscribe(listener);

    leave();
    control.actions.setValue(3);

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores a value it already holds', () => {
    const onValueChange = vi.fn();
    const control = createControl(counter, { defaultValue: 3, onValueChange }, null);

    const changed = control.actions.setValue(3);

    expect(changed).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('gives the callback the reason its setter was given', () => {
    const onValueChange = vi.fn();
    const control = createControl(counter, { onValueChange }, null);

    control.actions.setValue(3, 'drag');

    expect(onValueChange).toHaveBeenCalledWith(3, expect.objectContaining({ reason: 'drag' }));
  });

  it('keeps its value when the app cancels the change', () => {
    const control = createControl(counter, { onValueChange: refuse }, null);

    const changed = control.actions.setValue(3);

    expect(changed).toBe(false);
    expect(control.state()).toEqual({ value: 0 });
  });
});

describe('a control the app owns', () => {
  it('keeps the props of the render that last committed', () => {
    const control = createControl(counter, { value: 1 }, null);
    const next = { value: 2, step: 4 };

    control.sync(next);

    expect(control.props()).toBe(next);
  });

  it('reads the value from the props it was last handed', () => {
    const control = createControl(counter, { value: 1 }, null);

    control.sync({ value: 2 });

    expect(control.state()).toEqual({ value: 2 });
  });

  it('asks for the change and leaves the value to the app', () => {
    const onValueChange = vi.fn();
    const control = createControl(counter, { value: 1, onValueChange }, null);

    const changed = control.actions.setValue(2);

    expect(changed).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'set' }));
    expect(control.state()).toEqual({ value: 1 });
  });

  it('stays the app’s even when the prop goes away', () => {
    const control = createControl(counter, { value: 1 }, null);

    control.sync({});
    control.actions.setValue(2);

    expect(control.own()).toEqual({ value: 0 });
  });

  it('calls the callback of the latest render', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const control = createControl(counter, { onValueChange: first }, null);

    control.sync({ onValueChange: latest });
    control.actions.setValue(2);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

describe('an action', () => {
  it('reads the options of the latest render', () => {
    const control = createControl(counter, { step: 2 }, null);

    control.sync({ step: 5 });
    control.actions.increment();

    expect(control.state()).toEqual({ value: 5 });
  });

  it('reads the value the action before it left', () => {
    const control = createControl(counter, {}, null);

    control.actions.increment();
    control.actions.increment();

    expect(control.state()).toEqual({ value: 2 });
  });

  it('takes the arguments it is called with', () => {
    const control = createControl(counter, {}, null);

    const changed = control.actions.jump(7);

    expect(changed).toBe(true);
    expect(control.state()).toEqual({ value: 7 });
  });

  it('answers false when it changes nothing', () => {
    const control = createControl(counter, { defaultValue: 7 }, null);

    const changed = control.actions.jump(7);

    expect(changed).toBe(false);
  });

  it('gives its name to the callback as the reason', () => {
    const onValueChange = vi.fn();
    const control = createControl(counter, { onValueChange }, null);

    control.actions.increment();

    expect(onValueChange).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reason: 'increment', source: 'user', canceled: false }),
    );
  });
});

describe('what a component renders from', () => {
  it('is the state, the options, the setters and the actions in one object', () => {
    const control = createControl(counter, { step: 2 }, null);

    const view = control.view(control.own(), { step: 2 });

    expect(view).toEqual({ value: 0, step: 2, ...control.actions });
    expect(Object.keys(control.actions)).toEqual(['setValue', 'increment', 'jump']);
  });

  it('is the same object while nothing in it moved', () => {
    const control = createControl(counter, {}, null);

    const first = control.view(control.own(), {});
    const second = control.view(control.own(), { label: 'Volume' });

    expect(second).toBe(first);
  });

  it('is a new object once a value moved', () => {
    const control = createControl(counter, { value: 1 }, null);

    const first = control.view(control.own(), { value: 1 });
    const second = control.view(control.own(), { value: 2 });

    expect(second).not.toBe(first);
    expect(second).toMatchObject({ value: 2 });
  });
});

describe('a control under an engine', () => {
  it('has a short name there that stays its own', () => {
    const engine = createControlEngine();
    createControl(counter, {}, engine).attach();
    createControl(counter, {}, engine).attach();

    const names = engine.controls().map(engine.ref);

    expect(names).toEqual(['c1', 'c2']);
    expect(engine.controls().map(engine.ref)).toEqual(names);
  });

  it('is listed only while it is attached', () => {
    const engine = createControlEngine();
    const control = createControl(counter, {}, engine);

    const detach = control.attach();
    const listed = engine.controls();
    detach();

    expect(listed).toEqual([control]);
    expect(engine.controls()).toEqual([]);
  });

  it('reports a change that took effect', () => {
    const engine = createControlEngine();
    const changes: ControlChange[] = [];
    engine.observe((change) => changes.push(change));
    const control = createControl(counter, {}, engine);

    control.actions.increment();

    expect(changes).toEqual([
      expect.objectContaining({ control, key: 'value', previous: 0, next: 1 }),
    ]);
  });

  it('reports nothing for a change the app canceled', () => {
    const engine = createControlEngine();
    const observer = vi.fn();
    engine.observe(observer);
    const control = createControl(counter, { onValueChange: refuse }, engine);

    control.actions.increment();

    expect(observer).not.toHaveBeenCalled();
  });

  it('signs a change with whoever the engine says is acting', () => {
    const engine = createControlEngine();
    const onValueChange = vi.fn();
    const control = createControl(counter, { onValueChange }, engine);

    engine.as('tool', () => control.actions.increment());

    expect(onValueChange).toHaveBeenCalledWith(1, expect.objectContaining({ source: 'tool' }));
  });

  it('signs a later change as the person’s again', () => {
    const engine = createControlEngine();
    const onValueChange = vi.fn();
    const control = createControl(counter, { onValueChange }, engine);

    engine.as('tool', () => control.actions.increment());
    control.actions.increment();

    expect(onValueChange).toHaveBeenLastCalledWith(2, expect.objectContaining({ source: 'user' }));
  });
});

describe('an observer', () => {
  it('hears nothing once it has left', () => {
    const engine = createControlEngine();
    const observer = vi.fn();
    const leave = engine.observe(observer);
    const control = createControl(counter, {}, engine);

    leave();
    control.actions.increment();

    expect(observer).not.toHaveBeenCalled();
  });

  it('gets the acting source back even when the run throws', () => {
    const engine = createControlEngine();

    const run = () =>
      engine.as('tool', () => {
        throw new Error('refused');
      });

    expect(run).toThrow('refused');
    expect(engine.source()).toBe('user');
  });
});
