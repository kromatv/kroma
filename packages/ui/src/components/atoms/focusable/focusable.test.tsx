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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { armPressGuard, clearPressGuard } from '#ui/lib/press-guard';
import { Focusable } from './focusable';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
  // input-source is module state: a test that swept the pointer would otherwise
  // leave the next one thinking a cursor is driving.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

const host = (label: string) => screen.getByLabelText(label);

// On the browser targets a control is one element, so the labelled host is
// also the element the ring and focus scale paint on.
const painted = (label: string) => host(label);

// The ring is an outline standing off the control (see tokens/effects), so the
// question "is this the focus?" is asked of the outline and not of a shadow -
// several controls carry a shadow when nothing is focused at all.
const ringed = (label: string) => painted(label).style.outlineWidth !== '';

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

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
    const entry = painted('Entree');
    expect(entry.style.outlineWidth).toBe(`${activeTheme().ring.focusLift.outlineWidth}px`);
    expect(entry.style.outlineOffset).toBe(`${activeTheme().ring.focusLift.outlineOffset}px`);
    expect(entry.style.boxShadow.replace(/\s+/g, ' ')).toBe(activeTheme().ring.focusLift.boxShadow);
    expect(ringed('Premier')).toBe(false);
  });

  it('moves along a declared row on Left and Right', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Un" autoFocus />
        <Focusable label="Deux" />
      </FocusRegion>,
    );
    expect(ringed('Un')).toBe(true);

    press('ArrowRight');
    expect(ringed('Deux')).toBe(true);
    expect(ringed('Un')).toBe(false);

    press('ArrowLeft');
    expect(ringed('Un')).toBe(true);
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
    expect(ringed('A2')).toBe(true);

    // A row you have never been in opens at its beginning...
    press('ArrowDown');
    expect(ringed('B1')).toBe(true);
    press('ArrowRight');
    expect(ringed('B2')).toBe(true);

    // ...and a row you come back to gives you back where you were.
    press('ArrowUp');
    expect(ringed('A2')).toBe(true);
    press('ArrowDown');
    expect(ringed('B2')).toBe(true);
  });

  it('stays put when a direction has nowhere to go', () => {
    screenWith(
      <FocusRegion>
        <Focusable label="Seul" autoFocus />
      </FocusRegion>,
    );
    press('ArrowLeft');
    press('ArrowUp');
    expect(ringed('Seul')).toBe(true);
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
    expect(ringed('Suivant')).toBe(true);
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

  it('applies a focus state layer from the design tokens', () => {
    screenWith(<Focusable label="Chip" autoFocus states={{ focus: { bg: 'accentSoft' } }} />);
    expect(painted('Chip').style.backgroundColor.replace(/\s+/g, ' ')).toBe(
      'var(--kroma-accent-soft)',
    );
  });

  // The pointer's own state, which only these browser targets have at all. Two
  // tests because a control renders through two entirely different elements
  // depending on whether a navigator is mounted above it, and the mouse has to
  // be heard through both - the second is the one clients/web actually renders.
  it('applies a hover state layer while a pointer rests on a navigator node', () => {
    // The navigator's own view is a plain <View>, so the hover arrives as
    // React's enter/leave pair - derived from `pointerover`/`pointerout`, which
    // is what the events below dispatch.
    screenWith(<Focusable label="Survol" states={{ hover: { bg: 'accentSoft' } }} />);
    expect(painted('Survol').style.backgroundColor).toBe('');

    fireEvent.pointerOver(host('Survol'));
    expect(painted('Survol').style.backgroundColor.replace(/\s+/g, ' ')).toBe(
      'var(--kroma-accent-soft)',
    );

    fireEvent.pointerOut(host('Survol'));
    expect(painted('Survol').style.backgroundColor).toBe('');
  });

  it('grows under the pointer by the amount it grows on focus', () => {
    // The controls with no fill to brighten - a poster, a card, a genre tile -
    // carry their hover on the scale alone, so it answers the cursor as well as
    // the remote. A control that asked for no focus scale still gets none.
    screenWith(
      <>
        <Focusable label="Tuile" focusScale={1.06} />
        <Focusable label="Plate" />
      </>,
    );
    expect(painted('Tuile').style.transform).toBe('scale(1)');

    fireEvent.pointerOver(host('Tuile'));
    expect(painted('Tuile').style.transform).toContain('scale(1.06)');

    fireEvent.pointerOver(host('Plate'));
    expect(painted('Plate').style.transform).toBe('');

    fireEvent.pointerOut(host('Tuile'));
    expect(painted('Tuile').style.transform).toBe('scale(1)');
  });

  it('applies a hover state layer on a page with no navigator at all', () => {
    // No <FocusScope>: the plain pressable form, which is every kit control on
    // clients/web. Nothing can focus it and no finger will press it, so the
    // hover is the ONLY answer a cursor gets there.
    render(<Focusable label="Nu" states={{ hover: { bg: 'accentSoft' } }} />);
    const wash = () => getComputedStyle(painted('Nu')).backgroundColor;
    expect(wash()).toBe('rgba(0, 0, 0, 0)');

    // A Pressable listens for the hover itself (react-native-web's useHover),
    // straight on the element rather than through React's delegation.
    fireEvent.pointerEnter(host('Nu'));
    expect(wash()).toBe('var(--kroma-accent-soft)');

    fireEvent.pointerLeave(host('Nu'));
    expect(wash()).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('focus visibility', () => {
  it('rings a focus the keys drove', () => {
    screenWith(
      <FocusRegion>
        <Focusable autoFocus label="Keyed" />
      </FocusRegion>,
    );
    expect(ringed('Keyed')).toBe(true);
  });

  it('does not park the ring on a control the cursor merely swept', () => {
    // The navigator focuses on mouse-enter once a pointer has moved, and never
    // blurs on leave because its model keeps exactly one owner. Without
    // :focus-visible semantics the amber ring stays on whatever the cursor
    // passed last, which reads as a selection nobody made.
    fireEvent.mouseMove(window);
    screenWith(
      <FocusRegion>
        <Focusable autoFocus label="Swept" />
      </FocusRegion>,
    );
    expect(ringed('Swept')).toBe(false);
  });

  it('restores the ring as soon as a key is pressed', () => {
    fireEvent.mouseMove(window);
    screenWith(
      <FocusRegion>
        <Focusable autoFocus label="Un" />
        <Focusable label="Deux" />
      </FocusRegion>,
    );
    expect(ringed('Un')).toBe(false);
    press('ArrowRight');
    expect(ringed('Deux')).toBe(true);
  });
});
