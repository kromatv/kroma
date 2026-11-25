// @vitest-environment jsdom

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Counter, mount } from './control.fixtures';
import { MAX_STEPS } from './screen-act';
import { snapshot } from './screen-snapshot';
import { screenText } from './screen-text';
import { type ScreenTool, screenTools } from './screen-tools';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(cleanup);

function tool(name: string): ScreenTool {
  const found = screenTools.find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`no tool named ${name}`);
  }
  return found;
}

describe('the screen tools', () => {
  it('are named the way WebMCP takes a name, each once', () => {
    const names = screenTools.map((entry) => entry.name);

    expect(names).toEqual(['read_screen', 'list_controls', 'change_controls']);
    expect(names.every((name) => /^[\w.-]{1,128}$/.test(name))).toBe(true);
  });

  it('are marked as developer tools whose answer carries what the page shows', () => {
    const marks = screenTools.map(({ name, annotations }) => [name, annotations]);

    expect(Object.fromEntries(marks)).toEqual({
      read_screen: { readOnlyHint: true, untrustedContentHint: true, debugging: true },
      list_controls: { readOnlyHint: true, untrustedContentHint: true, debugging: true },
      change_controls: { readOnlyHint: false, untrustedContentHint: true, debugging: true },
    });
  });

  it('read the screen as text', async () => {
    mount(<Counter />);

    const text = await tool('read_screen').execute({});

    expect(text).toBe(screenText());
    expect(text).toMatch(/^ *Counter \[c1\] .*state: value=0 {2}actions: setValue/m);
  });

  it('list the controls as JSON', async () => {
    mount(<Counter />);

    const controls = await tool('list_controls').execute({});

    expect(controls).toEqual(snapshot());
    expect(controls).toMatchObject([{ ref: 'c1', name: 'Counter', state: { value: 0 } }]);
  });

  it('change a control the way act does', async () => {
    mount(<Counter />);

    const report = await tool('change_controls').execute({
      steps: [{ ref: 'c1', action: 'setValue', args: [4] }],
    });

    expect(report).toMatchObject({ ok: true, controls: [{ ref: 'c1', state: { value: 4 } }] });
  });

  it('answer a call of the wrong shape with the shape to send', async () => {
    const report = await tool('change_controls').execute({ ref: 'c1' });

    expect(report).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/^A call is \{/) },
    });
  });

  it('describe the call change_controls takes from the schema act parses it with', () => {
    const schema = tool('change_controls').inputSchema;

    expect(schema).toMatchObject({
      type: 'object',
      required: ['steps'],
      properties: {
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_STEPS,
          items: { required: ['ref', 'action'], properties: { args: { maxItems: 8 } } },
        },
      },
    });
  });

  it('take no input to read', () => {
    const reads = [tool('read_screen'), tool('list_controls')].map((entry) => entry.inputSchema);

    expect(reads).toEqual([
      { type: 'object', properties: {} },
      { type: 'object', properties: {} },
    ]);
  });
});
