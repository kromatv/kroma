import {
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
  renderHook as renderReactHook,
  render as renderTree,
} from '@testing-library/react';
import { type ComponentType, createElement, type ReactNode } from 'react';
import { createInputGate, type InputGate, InputGateProvider } from './lib/input-gate';

export type InputTestHost = InputGate & {
  render(ui: ReactNode, options?: RenderOptions): RenderResult;
  renderHook<Result, Props>(
    callback: (props: Props) => Result,
    options?: RenderHookOptions<Props>,
  ): RenderHookResult<Result, Props>;
  inputGate: InputGate;
  Host: ComponentType<{ children: ReactNode }>;
};

/** Bind test controls to the same real gate the rendered controls read. */
export function createInputTestHost(options?: {
  wrapper?: ComponentType<{ children?: ReactNode }>;
}): InputTestHost {
  const gate = createInputGate();
  function Host({ children }: { children: ReactNode }) {
    const content = createElement(InputGateProvider, { value: gate }, children);
    return options?.wrapper ? createElement(options.wrapper, null, content) : content;
  }
  function render(ui: ReactNode, options?: RenderOptions) {
    const Outer = options?.wrapper;
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(Host, null, Outer ? createElement(Outer, null, children) : children);
    }
    return renderTree(ui, { ...options, wrapper: Wrapper });
  }
  function renderHook<Result, Props>(
    callback: (props: Props) => Result,
    options?: RenderHookOptions<Props>,
  ) {
    const Outer = options?.wrapper;
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(Host, null, Outer ? createElement(Outer, null, children) : children);
    }
    return renderReactHook(callback, { ...options, wrapper: Wrapper });
  }
  return { ...gate, render, renderHook, inputGate: gate, Host };
}
