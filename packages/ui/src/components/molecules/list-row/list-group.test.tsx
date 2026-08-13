// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL } from '#ui/lib/field-shell';
import { ListRow } from './list-row';

afterEach(cleanup);

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
  // stripes across its neighbours: the card says so, and the browser targets
  // draw the ring inward (the rule in styles/base.css).
  it('says its members wear the ring inward', () => {
    const { container } = render(
      <ListRow.Group>
        <ListRow.Root onPress={vi.fn()}>
          <ListRow.Label>Membre</ListRow.Label>
        </ListRow.Root>
      </ListRow.Group>,
    );
    const card = container.querySelector('[data-focus-ring-inset]');
    expect(card).toBeTruthy();
    expect(card?.querySelector('[aria-label="Membre"]')).toBeTruthy();
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
