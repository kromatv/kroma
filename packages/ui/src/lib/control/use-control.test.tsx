// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ControlEngineProvider } from './control-context';
import { type ControlEngine, createControlEngine } from './control-engine';
import { defineControl } from './define-control';
import { useControl } from './use-control.hook';

const counter = defineControl('counter', {
  state: { value: 0 },
  options: { step: 1 },
  actions: {
    increment: ({ value, step }) => ({ value: value + step }),
    jump: (_now, to: number) => ({ value: to }),
  },
});

type CounterProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (next: number) => void;
  step?: number;
  label?: string;
};

const under = (engine: ControlEngine) =>
  function Host({ children }: Readonly<{ children: ReactNode }>) {
    return <ControlEngineProvider value={engine}>{children}</ControlEngineProvider>;
  };

const mount = (initialProps: CounterProps, engine = createControlEngine()) =>
  renderHook((props: CounterProps) => useControl(counter, props), {
    initialProps,
    wrapper: under(engine),
  });

describe('a component on a control', () => {
  it('renders the new value after an action', () => {
    const { result } = mount({});

    act(() => {
      result.current[0].increment();
    });

    expect(result.current[0].value).toBe(1);
  });

  it('follows the prop of a key the app owns', () => {
    const { result, rerender } = mount({ value: 1 });

    rerender({ value: 2 });

    expect(result.current[0].value).toBe(2);
  });

  it('asks the app and keeps rendering what the app gives', () => {
    const onValueChange = vi.fn();
    const { result } = mount({ value: 1, onValueChange });

    act(() => {
      result.current[0].increment();
    });

    expect(onValueChange).toHaveBeenCalledWith(2, expect.objectContaining({ reason: 'increment' }));
    expect(result.current[0].value).toBe(1);
  });

  it('steps by the option of the render on screen', () => {
    const { result, rerender } = mount({ step: 2 });

    rerender({ step: 10 });
    act(() => {
      result.current[0].increment();
    });

    expect(result.current[0].value).toBe(10);
  });

  it('gets back the props the control did not read', () => {
    const { result } = mount({ defaultValue: 3, step: 2, label: 'Volume' });

    expect(result.current[1]).toEqual({ label: 'Volume' });
  });

  it('keeps one control object across renders that move nothing', () => {
    const { result, rerender } = mount({ label: 'Volume' });
    const before = result.current[0];

    rerender({ label: 'Brightness' });

    expect(result.current[0]).toBe(before);
  });

  it('works outside any provider', () => {
    const { result } = renderHook(() => useControl(counter, {}));

    act(() => {
      result.current[0].increment();
    });

    expect(result.current[0].value).toBe(1);
  });
});

describe('the engine of the provider above', () => {
  it('lists the control while its component is mounted', () => {
    const engine = createControlEngine();

    mount({ defaultValue: 3 }, engine);

    expect(engine.controls().map((control) => control.state())).toEqual([{ value: 3 }]);
  });

  it('drops the control when its component unmounts', () => {
    const engine = createControlEngine();
    const { unmount } = mount({}, engine);

    unmount();

    expect(engine.controls()).toEqual([]);
  });

  it('reads the state a tool would act on from the latest render', () => {
    const engine = createControlEngine();
    const { rerender } = mount({ value: 1 }, engine);

    rerender({ value: 2 });

    expect(engine.controls()[0]?.state()).toEqual({ value: 2 });
  });
});
