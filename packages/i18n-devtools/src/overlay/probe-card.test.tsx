// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setEngine } from '../engine/engine';
import type { Lingua } from '../server/host';
import { testEngine } from '../testing';
import { forgetMarks, mark } from './mark';
import { installProbe } from './probe';
import { ProbeCard } from './probe-card.component';

const LINGUA: Lingua = { url: 'https://lingua.kroma.tv', project: 'kromatv/kroma' };

let stop = () => {};

async function hovering(scope: string | null, lingua: Lingua | null): Promise<void> {
  const shown = mark(
    {
      key: 'nav.home',
      from: { scope, locale: 'en' },
      locale: 'en',
      text: 'Home',
      vars: undefined,
      holes: [],
    },
    'Home',
  );
  const line = document.body.appendChild(document.createElement('p'));
  line.textContent = shown;
  Reflect.set(document, 'caretPositionFromPoint', () => ({ offsetNode: line.firstChild }));
  render(<ProbeCard editKey="E" confirmKey="C" linguaKey="L" lingua={lingua} />);
  stop = installProbe('all', null);
  await act(async () => {
    document.dispatchEvent(new MouseEvent('pointermove'));
    await new Promise((frame) => requestAnimationFrame(frame));
  });
}

beforeEach(() => {
  Reflect.set(Range.prototype, 'getBoundingClientRect', () => ({ left: 0, top: 0, bottom: 0 }));
  setEngine(testEngine({ writable: true, activeLocale: () => 'en' }));
});

afterEach(() => {
  stop();
  cleanup();
  document.body.innerHTML = '';
  setEngine(null);
  forgetMarks();
});

describe('the card under the pointer', () => {
  it('offers to open an app message in Lingua', async () => {
    await hovering(null, LINGUA);

    expect(screen.getByText('Lingua')).toBeDefined();
  });

  it('offers no Lingua where the repository has none', async () => {
    await hovering(null, null);

    expect(screen.getByText('edit')).toBeDefined();
    expect(screen.queryByText('Lingua')).toBeNull();
  });

  it('offers no Lingua for a module message', async () => {
    await hovering('tv.kroma.torrents', LINGUA);

    expect(screen.getByText('edit')).toBeDefined();
    expect(screen.queryByText('Lingua')).toBeNull();
  });
});
