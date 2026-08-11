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
        <ListRow.Root label="Langue" onPress={vi.fn()} />
        <ListRow.Root label="Clavier" onPress={vi.fn()} />
        <ListRow.Root label="À propos" onPress={vi.fn()} />
      </ListRow.Group>,
    );
    expect(screen.getByLabelText('Langue')).toBeTruthy();
    expect(screen.getByLabelText('Clavier')).toBeTruthy();
    expect(screen.getByLabelText('À propos')).toBeTruthy();
  });

  // The contract the group exists for: ONE surface for the list, so a member
  // must not carry the lift a standalone row does.
  it('takes the surface off its members', () => {
    const { container: alone } = render(<ListRow.Root label="Seule" />);
    const standalone = alone.querySelector('[aria-label="Seule"]') as HTMLElement;
    expect(getComputedStyle(standalone).boxShadow).toBeTruthy();
    expect(getComputedStyle(standalone).backgroundColor).toBeTruthy();

    cleanup();
    const { container: grouped } = render(
      <ListRow.Group>
        <ListRow.Root label="Membre" />
      </ListRow.Group>,
    );
    const member = grouped.querySelector('[aria-label="Membre"]') as HTMLElement;
    expect(getComputedStyle(member).boxShadow).toBeFalsy();
    expect(getComputedStyle(member).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('declares its size to the members, which still get the last word', () => {
    const { container } = render(
      <ListRow.Group size="tv">
        <ListRow.Root label="Suit" />
        <ListRow.Root label="Décide" size="sm" />
      </ListRow.Group>,
    );
    const heightOf = (name: string) =>
      getComputedStyle(container.querySelector(`[aria-label="${name}"]`) as HTMLElement).minHeight;
    expect(heightOf('Suit')).toBe(`${CONTROL.tv.height}px`);
    expect(heightOf('Décide')).toBe(`${CONTROL.sm.height}px`);
  });
});
