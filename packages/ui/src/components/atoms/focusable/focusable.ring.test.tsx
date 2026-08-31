// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { activeTheme } from '#ui/core';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { RingScopeProvider } from '#ui/lib/ring-scope';
import { Focusable } from './focusable';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

const painted = (label: string) => screen.getByLabelText(label);

function screenWith(children: ReactNode) {
  return render(<FocusScope>{children}</FocusScope>);
}

describe('the ring a control draws', () => {
  it("suppresses the browser's own outline on a control that opted out", () => {
    render(<Focusable label="Ronde" ring={false} onPress={() => {}} />);

    expect(painted('Ronde').style.outlineStyle).toBe('none');
    expect(painted('Ronde').style.outlineWidth).toBe('0px');
  });

  it('composes no outline at all on a control that asked for nothing', () => {
    render(<Focusable label="Nue" onPress={() => {}} />);

    expect(painted('Nue').style.outlineStyle).toBe('');
  });

  it('keeps the ring a control paints itself after opting out of the kit ring', () => {
    render(<Focusable label="Propre" ring={false} focused states={{ focus: { ring: 'focus' } }} />);

    expect(getComputedStyle(painted('Propre')).outlineStyle).toBe('solid');
  });

  it('draws the ring a control names rather than the one that lifts off the page', () => {
    screenWith(
      <FocusRegion>
        <Focusable autoFocus label="Bord" ring="focusInset" />
      </FocusRegion>,
    );

    expect(painted('Bord').style.outlineOffset).toBe(
      `${activeTheme().ring.focusInset.outlineOffset}px`,
    );
  });

  it('takes the ring of the surface that clips it when it names none itself', () => {
    screenWith(
      <RingScopeProvider value="focusInset">
        <FocusRegion>
          <Focusable autoFocus label="Membre" />
        </FocusRegion>
      </RingScopeProvider>,
    );

    expect(painted('Membre').style.outlineOffset).toBe(
      `${activeTheme().ring.focusInset.outlineOffset}px`,
    );
  });

  it('lets a control name a ring its enclosing scope did not', () => {
    screenWith(
      <RingScopeProvider value="focusInset">
        <FocusRegion>
          <Focusable autoFocus label="Propre" ring="focusEdge" />
        </FocusRegion>
      </RingScopeProvider>,
    );

    expect(painted('Propre').style.outlineOffset).toBe(
      `${activeTheme().ring.focusEdge.outlineOffset}px`,
    );
  });
});
