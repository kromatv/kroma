// @vitest-environment jsdom
//
// Proves the universal kit renders and NAVIGATES through react-native-web: the
// same <Focusable> source Apple TV compiles natively must, in a browser, join
// the spatial navigator, take the screen's entry focus, wear the amber ring, and
// fire on OK. If this file passes, the Tizen / webOS bundles have a working
// view layer and a working remote.
//
// The remote is driven the way the shells drive it - key events on the document
// - rather than by poking React state, so what is tested is the whole path a
// press actually takes.

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { armPressGuard, clearPressGuard } from '#ui/lib/press-guard';
import { colors, ring } from '#ui/lib/tokens';
import { Focusable } from './focusable';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

/** The rendered host element for a focusable labelled `label`. */
const host = (label: string) => screen.getByLabelText(label);

/** The element the ring and the focus scale are painted on. On the browser
 * targets a control is ONE element - the navigator's own view carries the box -
 * so this is the labelled host itself. */
const painted = (label: string) => host(label);

/** One remote press, as the browser targets deliver it. */
function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** A screen: the navigator needs a root, exactly as the router gives it one. */
function screenWith(children: React.ReactNode) {
  return render(<FocusScope>{children}</FocusScope>);
}

describe('Focusable on react-native-web', () => {
  it('renders an accessible host for every control', () => {
    screenWith(<Focusable label="Play" />);
    expect(host('Play').getAttribute('role')).toBe('button');
  });

  it('takes the screen entry focus where `autoFocus` says, and wears the ring', () => {
    screenWith(
      <>
        <Focusable label="Premier" />
        <Focusable label="Entree" autoFocus />
      </>,
    );
    expect(painted('Entree').style.boxShadow.replace(/\s+/g, ' ')).toBe(ring.focusLift);
    expect(painted('Premier').style.boxShadow).toBe('');
  });

  it('moves along a declared row on Left and Right', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Un" autoFocus />
        <Focusable label="Deux" />
      </FocusRegion>,
    );
    expect(painted('Un').style.boxShadow).not.toBe('');

    press('ArrowRight');
    expect(painted('Deux').style.boxShadow).not.toBe('');
    expect(painted('Un').style.boxShadow).toBe('');

    press('ArrowLeft');
    expect(painted('Un').style.boxShadow).not.toBe('');
  });

  it('moves between rows on Up and Down, and each row remembers its place', () => {
    screenWith(
      <>
        <FocusRegion>
          <Focusable label="A1" autoFocus />
          <Focusable label="A2" />
        </FocusRegion>
        <FocusRegion>
          <Focusable label="B1" />
          <Focusable label="B2" />
        </FocusRegion>
      </>,
    );
    press('ArrowRight');
    expect(painted('A2').style.boxShadow).not.toBe('');

    // A row you have never been in opens at its beginning...
    press('ArrowDown');
    expect(painted('B1').style.boxShadow).not.toBe('');
    press('ArrowRight');
    expect(painted('B2').style.boxShadow).not.toBe('');

    // ...and a row you come back to gives you back where you were.
    press('ArrowUp');
    expect(painted('A2').style.boxShadow).not.toBe('');
    press('ArrowDown');
    expect(painted('B2').style.boxShadow).not.toBe('');
  });

  it('stays put when a direction has nowhere to go', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Seul" autoFocus />
      </FocusRegion>,
    );
    press('ArrowLeft');
    press('ArrowUp');
    expect(painted('Seul').style.boxShadow).not.toBe('');
  });

  it('skips a disabled control entirely', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Actif" autoFocus />
        <Focusable label="Indispo" disabled />
        <Focusable label="Suivant" />
      </FocusRegion>,
    );
    press('ArrowRight');
    expect(painted('Suivant').style.boxShadow).not.toBe('');
  });

  it('fires onPress on OK, the key a TV remote sends', () => {
    const onPress = vi.fn();
    screenWith(<Focusable label="OK" autoFocus onPress={onPress} />);
    press('Enter');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('swallows the press that carried over from the previous screen', () => {
    const onPress = vi.fn();
    screenWith(<Focusable label="OK" autoFocus onPress={onPress} />);
    armPressGuard();
    press('Enter');
    expect(onPress).not.toHaveBeenCalled();
    clearPressGuard();
    press('Enter');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('scales on focus when the design asks for it, and not otherwise', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Tuile" autoFocus focusScale={1.06} />
        <Focusable label="Plate" />
      </FocusRegion>,
    );
    expect(painted('Tuile').style.transform).toContain('scale(1.06)');
    press('ArrowRight');
    expect(painted('Plate').style.transform).toBe('');
  });

  it('exposes focus state to a render-prop child', () => {
    screenWith(
      <Focusable label="Etat" autoFocus>
        {({ focused }) => <span data-testid="state">{focused ? 'on' : 'off'}</span>}
      </Focusable>,
    );
    expect(screen.getByTestId('state').textContent).toBe('on');
  });

  it('applies focusedStyle from the design tokens', () => {
    screenWith(
      <Focusable label="Chip" autoFocus focusedStyle={{ backgroundColor: colors.accentSoft }} />,
    );
    expect(painted('Chip').style.backgroundColor.replace(/\s+/g, ' ')).toBe(colors.accentSoft);
  });
});
