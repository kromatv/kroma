// @vitest-environment jsdom

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Counter, mount } from './control.fixtures';
import { offerScreenTools } from './offer-screen-tools';
import type { ScreenTool } from './screen-tools';

const TOOLS = ['read_screen', 'list_controls', 'change_controls'];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'modelContext');
});

function modelContext(registerTool: (tool: ScreenTool) => Promise<void>) {
  const context = { registerTool: vi.fn(registerTool) };
  Reflect.set(document, 'modelContext', context);
  return context;
}

const registered = (calls: readonly (readonly [ScreenTool])[]) => calls.map(([tool]) => tool.name);

describe('offering the screen tools', () => {
  it('registers each with the page model context, called on it', async () => {
    const context = modelContext(async () => undefined);

    offerScreenTools();

    await vi.waitFor(() => expect(registered(context.registerTool.mock.calls)).toEqual(TOOLS));
    expect(context.registerTool.mock.contexts).toEqual([context, context, context]);
  });

  it('tells a developer when the page refuses one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    modelContext(async (tool) => {
      if (tool.name === 'list_controls') {
        throw new DOMException('Duplicate tool name', 'InvalidStateError');
      }
    });

    offerScreenTools();

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'The screen tools were not registered with WebMCP: InvalidStateError: Duplicate tool name',
      ),
    );
  });

  it('does nothing in a browser without WebMCP', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Reflect.set(document, 'modelContext', {});

    offerScreenTools();
    await import('./screen-tools');

    expect(warn).not.toHaveBeenCalled();
  });

  it('is what the first KitProvider of a page does', async () => {
    Reflect.deleteProperty(globalThis, '__KROMA_UI__');
    const context = modelContext(async () => undefined);

    mount(<Counter />);

    await vi.waitFor(() => expect(registered(context.registerTool.mock.calls)).toEqual(TOOLS));
  });
});
