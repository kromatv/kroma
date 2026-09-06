// @vitest-environment jsdom
//
// The lift chain has to FALL as reliably as it rises. A container that stays
// lifted after its focus has gone paints over everything after it for the rest
// of the screen's life, and nothing on screen says why.

import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { View } from 'react-native';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { FocusLiftHost, FocusLiftView, LIFTED } from '#ui/lib/focus-lift';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { declared } from '#ui/testing';

beforeAll(() => configureRemote());
afterEach(cleanup);

const lifted = () => declared(screen.getByTestId('host'), 'zIndex') === '1';

// The only focusable inside the host is the one under test, so nothing inside
// can inherit the focus when it goes: whatever the navigator does next, this
// host is no longer holding anything.
function tree(withTile: boolean) {
  return (
    <FocusScope>
      <FocusLiftHost>
        {(held) => (
          <View testID="host" style={held ? LIFTED : undefined}>
            {withTile ? <Focusable label="Tile" autoFocus /> : null}
          </View>
        )}
      </FocusLiftHost>
      <Focusable label="Elsewhere" />
    </FocusScope>
  );
}

describe('the focus lift chain', () => {
  it('lifts the container that holds the focus', () => {
    render(tree(true));
    expect(lifted()).toBe(true);
  });

  it('drops the container when the focused control unmounts', () => {
    const { rerender } = render(tree(true));
    expect(lifted()).toBe(true);

    // The tile goes away while it still holds the focus: a rail whose data
    // refreshed under it, a control shed by a layout, a row that emptied.
    // Nothing delivers a blur to a component that is no longer there.
    rerender(tree(false));

    expect(lifted()).toBe(false);
  });
});

describe('a lifting container', () => {
  const holder = (label: string) => screen.getByLabelText(label).parentElement as HTMLElement;

  function pair() {
    render(
      <FocusScope>
        <FocusLiftView>
          <Focusable label="Tile" autoFocus />
        </FocusLiftView>
        <FocusLiftView>
          <Focusable label="Elsewhere" />
        </FocusLiftView>
      </FocusScope>,
    );
  }

  it('rises above the container beside it while it holds the focus', () => {
    pair();
    expect(declared(holder('Tile'), 'zIndex')).toBe('1');
  });

  it('grounds itself on a number rather than on nothing', () => {
    pair();

    expect(declared(holder('Elsewhere'), 'zIndex')).toBe('0');
  });
});

// The app mounts under <StrictMode> (mount.web.tsx), which double-invokes
// renders and effects. A lift chain that reports from inside its `setHeld`
// updater is counted twice there and warns that it updated one component while
// another rendered - which is what left the ring on every tile it had passed.
describe('a lift chain under StrictMode', () => {
  function nested() {
    render(
      <StrictMode>
        <FocusScope>
          <FocusLiftView>
            <FocusLiftView>
              <Focusable label="Tile" autoFocus />
            </FocusLiftView>
          </FocusLiftView>
        </FocusScope>
      </StrictMode>,
    );
  }

  it('never updates one container while another is rendering', () => {
    const said: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => said.push(String(a[0])));

    nested();

    spy.mockRestore();
    expect(said.filter((line) => /while rendering a different component/.test(line))).toEqual([]);
  });

  it('lifts every container between the control and the screen exactly once', () => {
    nested();

    const inner = screen.getByLabelText('Tile').parentElement as HTMLElement;
    expect(declared(inner, 'zIndex')).toBe('1');
    expect(declared(inner.parentElement as HTMLElement, 'zIndex')).toBe('1');
  });
});
