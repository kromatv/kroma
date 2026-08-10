// @vitest-environment jsdom
//
// <FocusScroll>'s whole policy: a row rests `offsetFromStart` below the top edge,
// and neither end of the content is ever scrolled past. Plus what <FocusSlot>
// is for: holding a place in the navigator's order for something that is not
// there yet.

import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { configureRemote } from './focus-remote';
import { FocusRegion, FocusScope } from './focus-scope';
import { FocusSlot, pageOffset } from './focus-scroll';

const page = { viewport: 1080, content: 6480 };

describe('pageOffset', () => {
  it('rests a row below the top edge by the offset', () => {
    expect(pageOffset({ top: 1400, offsetFromStart: 120, ...page })).toBe(1280);
  });

  it('shows the first row whole, offset or not', () => {
    expect(pageOffset({ top: 0, offsetFromStart: 120, ...page })).toBe(0);
  });

  it('never scrolls past the last screenful', () => {
    expect(pageOffset({ top: 6400, offsetFromStart: 120, ...page })).toBe(5400);
  });

  it('does not scroll a page that fits', () => {
    expect(pageOffset({ top: 700, offsetFromStart: 120, viewport: 1080, content: 900 })).toBe(0);
  });
});

beforeAll(() => configureRemote());
afterEach(cleanup);

const LABELS = ['Back', 'Pill', 'Avatar'];
const lit = (): string[] =>
  LABELS.filter((label) =>
    screen.queryByLabelText(label)?.getAttribute('style')?.includes('box-shadow'),
  );

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

// The navigator orders siblings by the order they REGISTER, which is the order
// they mount - so a control that appears later joins the row at its end, however
// far left it is drawn. A bar that outlives its screens (the browse top bar,
// whose back button appears only once there is somewhere to go back to) is
// exactly where that bites.
describe('FocusSlot', () => {
  function Bar({ back }: Readonly<{ back: boolean }>) {
    return (
      <FocusRegion>
        <FocusSlot>{back ? <Focusable label="Back" /> : null}</FocusSlot>
        <Focusable label="Pill" autoFocus />
        <Focusable label="Avatar" />
      </FocusRegion>
    );
  }

  function mount() {
    let show: (v: boolean) => void = () => {};
    function Host() {
      const [back, setBack] = useState(false);
      show = setBack;
      return <Bar back={back} />;
    }
    render(
      <FocusScope>
        <Host />
      </FocusScope>,
    );
    return () => act(() => show(true));
  }

  it('keeps a place for a control that mounts later', () => {
    const showBack = mount();
    expect(lit()).toEqual(['Pill']);
    showBack();
    press('ArrowLeft');
    expect(lit()).toEqual(['Back']);
  });

  it('leaves the rest of the row in place', () => {
    const showBack = mount();
    showBack();
    press('ArrowRight');
    expect(lit()).toEqual(['Avatar']);
  });
});
