// @vitest-environment jsdom

import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VolumeDemo } from './control-demos.component';

afterEach(() => {
  cleanup();
});

function code(): string {
  return (document.body.textContent ?? '').replaceAll(/' \+\s*'/g, '');
}

async function shows(text: string | RegExp) {
  await waitFor(() => {
    expect(code()).toMatch(text);
  });
}

async function demo() {
  render(onScreen(<VolumeDemo />));
  await shows('state: { value: 4 }');
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function run(action: string) {
  const at = ['louder', 'press'].indexOf(action);
  const button = screen.getAllByRole('button', { name: 'Run' }).at(at);
  if (!button) {
    throw new Error(`no call runs ${action}`);
  }
  fireEvent.click(button);
}

describe('the volume in the control engine guide', () => {
  it('shows a tool what the volume holds and what it may call', async () => {
    await demo();

    expect(code()).toContain("actions: ['setValue', 'louder', 'quieter', 'mute']");
  });

  it('writes each call a tool can make with the ref the volume was given', async () => {
    await demo();

    expect(code()).toMatch(
      /await __KROMA_UI__\.act\(\{ steps: \[\{ ref: 'c\d+', action: 'louder' \}\] \}\)/,
    );
  });

  it('tells the app a person turned it up, with the action as the reason', async () => {
    await demo();

    press('Louder');

    await shows("onValueChange(5, { reason: 'louder', source: 'user' })");
  });

  it('shows the tool the new value once a person has moved it', async () => {
    await demo();

    press('Louder');

    await shows('state: { value: 5 }');
  });

  it('runs a tool call through the same path, signed by the tool', async () => {
    await demo();

    run('louder');

    await shows("onValueChange(5, { reason: 'louder', source: 'tool' })");
    await shows(/steps: \[\{ step: 0, ref: 'c\d+', action: 'louder', outcome: 'changed' \}\]/);
  });

  it('tells the tool which calls the volume takes when it asks for another', async () => {
    await demo();

    run('press');

    await shows('ok: false');
    await shows(/has no such action\. It takes: setValue, louder, quieter, mute\./);
  });
});
