// @vitest-environment jsdom
import type { HandoffBeaconView } from '@kroma/core';
import { configureRemote, Focusable } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvNavProvider, useNav } from '#tv/app/router';
import { AuthScreen } from '#tv/shared/ui/AuthScreen';

const beacon = vi.hoisted(() => ({ current: null as { name: string; check: string } | null }));
vi.mock('#tv/app/providers/handoffBeacon', () => ({
  useHandoffBeacon: (): HandoffBeaconView | null => beacon.current,
}));

beforeAll(() => configureRemote());
beforeEach(() => {
  beacon.current = null;
});
afterEach(cleanup);

const LABELS = ['Back', 'First', 'Second'];

// Which control the navigator rests on. On the browser targets a control paints
// its own focus: the amber ring is a box-shadow, and the Back button - which
// wears no ring, so it can float over artwork - answers with its focus scale.
const lit = (): string[] =>
  LABELS.filter((label) => {
    const style = screen.queryByLabelText(label)?.getAttribute('style') ?? '';
    return style.includes('box-shadow') || /transform: scale\(1\.\d/.test(style);
  });

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

// The button hides itself at the root of the stack, and a node joins the
// navigator in the order it MOUNTS - so the screen must not exist before the
// stack it is on.
function Deep({ children }: Readonly<{ children: ReactNode }>) {
  const nav = useNav();
  useEffect(() => {
    if (!nav.canGoBack) nav.go('about');
  }, [nav]);
  return nav.canGoBack ? children : null;
}

function mount() {
  render(
    onScreen(
      <TvNavProvider screens={{} as never}>
        <Deep>
          <AuthScreen>
            <Focusable label="First" autoFocus />
            <Focusable label="Second" />
          </AuthScreen>
        </Deep>
      </TvNavProvider>,
    ),
  );
}

describe('AuthScreen', () => {
  it('puts Back one Up press above the content, not below all of it', () => {
    mount();
    // The way out is not where the screen opens: that is `autoFocus`'s.
    expect(lit()).toEqual(['First']);

    press('ArrowUp');
    expect(lit()).toEqual(['Back']);
    press('ArrowDown');
    expect(lit()).toEqual(['First']);
    press('ArrowDown');
    expect(lit()).toEqual(['Second']);
    // The bottom of the screen is the bottom: Down no longer falls off the last
    // row onto a button drawn at the top.
    press('ArrowDown');
    expect(lit()).toEqual(['Second']);
  });

  it('prints the check string beside the name a phone lists this TV under', () => {
    beacon.current = { name: 'Salon', check: 'K7QM' };
    mount();

    expect(screen.getByText('On your phone this TV is listed as Salon')).toBeTruthy();
    expect(screen.getByText('Code K7QM')).toBeTruthy();
  });

  it('says nothing about a beacon while this TV is not waiting under one', () => {
    mount();
    expect(screen.queryByText(/Code/)).toBeNull();
  });

  it('never makes the beacon a stop of its own: it is read, not pressed', () => {
    beacon.current = { name: 'Salon', check: 'K7QM' };
    mount();

    press('ArrowDown');
    press('ArrowDown');
    expect(lit()).toEqual(['Second']);
  });
});
