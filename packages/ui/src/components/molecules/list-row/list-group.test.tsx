// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { activeTheme } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { ListRow } from './list-row';

beforeAll(() => configureRemote());

afterEach(cleanup);

// On the browser targets a control is one element, so the labelled host is also
// the element the ring paints on.
const painted = (label: string) => screen.getByLabelText(label);

describe('ListRow.Group', () => {
  it('renders every member', () => {
    render(
      <ListRow.Group>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>Langue</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>Clavier</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>À propos</ListRow.Label>
        </ListRow.Root>
      </ListRow.Group>,
    );
    expect(screen.getByLabelText('Langue')).toBeTruthy();
    expect(screen.getByLabelText('Clavier')).toBeTruthy();
    expect(screen.getByLabelText('À propos')).toBeTruthy();
  });

  // The contract the group exists for: ONE surface for the list, so a member
  // must not carry the lift a standalone row does.
  it('takes the surface off its members', () => {
    const { container: alone } = render(
      <ListRow.Root>
        <ListRow.Label>Seule</ListRow.Label>
      </ListRow.Root>,
    );
    const standalone = alone.querySelector('[aria-label="Seule"]') as HTMLElement;
    expect(getComputedStyle(standalone).boxShadow).toBeTruthy();
    expect(getComputedStyle(standalone).backgroundColor).toBeTruthy();

    cleanup();
    const { container: grouped } = render(
      <ListRow.Group>
        <ListRow.Root>
          <ListRow.Label>Membre</ListRow.Label>
        </ListRow.Root>
      </ListRow.Group>,
    );
    const member = grouped.querySelector('[aria-label="Membre"]') as HTMLElement;
    expect(getComputedStyle(member).boxShadow).toBeFalsy();
    expect(getComputedStyle(member).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  // The card clips its members, so a ring standing off one would survive as two
  // stripes across its neighbours. The card says so to everything it holds -
  // including the controls a caller puts BESIDE a row, which is the case a rule
  // keyed on the row itself could never reach.
  it('hands every control in its card the inward ring, row or not', () => {
    render(
      <FocusScope>
        <ListRow.Group>
          <ListRow.Root>
            <ListRow.Label>Membre</ListRow.Label>
          </ListRow.Root>
          <Focusable label="Bascule" autoFocus />
        </ListRow.Group>
      </FocusScope>,
    );

    const inset = activeTheme().ring.focusInset;
    expect(painted('Bascule').style.outlineOffset).toBe(`${inset.outlineOffset}px`);
    expect(painted('Bascule').style.outlineWidth).toBe(`${inset.outlineWidth}px`);
  });

  // A member declines the STANDOFF ring, not every ring. Passing `ring={false}`
  // here once suppressed the outline outright, and a focused row showed nothing.
  it('still rings a focused member, drawn inward', () => {
    render(
      <FocusScope>
        <ListRow.Group>
          <ListRow.Root autoFocus onPress={vi.fn()}>
            <ListRow.Label>Membre</ListRow.Label>
          </ListRow.Root>
        </ListRow.Group>
      </FocusScope>,
    );

    const inset = activeTheme().ring.focusInset;
    const row = painted('Membre');
    expect(row.style.outlineWidth).toBe(`${inset.outlineWidth}px`);
    expect(row.style.outlineOffset).toBe(`${inset.outlineOffset}px`);
    expect(row.style.outlineStyle).not.toBe('none');
  });

  it('leaves a control outside it standing the ring off', () => {
    render(
      <FocusScope>
        <Focusable label="Seul" autoFocus />
      </FocusScope>,
    );

    expect(painted('Seul').style.outlineOffset).toBe(
      `${activeTheme().ring.focusLift.outlineOffset}px`,
    );
  });

  it('declares its size to the members, which still get the last word', () => {
    const { container } = render(
      <ListRow.Group size="tv">
        <ListRow.Root>
          <ListRow.Label>Suit</ListRow.Label>
        </ListRow.Root>
        <ListRow.Root size="sm">
          <ListRow.Label>Décide</ListRow.Label>
        </ListRow.Root>
      </ListRow.Group>,
    );
    const heightOf = (name: string) =>
      getComputedStyle(container.querySelector(`[aria-label="${name}"]`) as HTMLElement).minHeight;
    expect(heightOf('Suit')).toBe(`${CONTROL.tv.height}px`);
    expect(heightOf('Décide')).toBe(`${CONTROL.sm.height}px`);
  });
});
