// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListRow } from './list-row';

afterEach(cleanup);

describe('ListRow.Group', () => {
  it('renders every member', () => {
    render(
      <ListRow.Group>
        <ListRow label="Langue" onPress={vi.fn()} />
        <ListRow label="Clavier" onPress={vi.fn()} />
        <ListRow label="À propos" onPress={vi.fn()} />
      </ListRow.Group>,
    );
    expect(screen.getByLabelText('Langue')).toBeTruthy();
    expect(screen.getByLabelText('Clavier')).toBeTruthy();
    expect(screen.getByLabelText('À propos')).toBeTruthy();
  });

  // The contract the group exists for: ONE surface for the list, so a member
  // must not carry the lift a standalone row does.
  it('takes the surface off its members', () => {
    const { container: alone } = render(<ListRow label="Seule" />);
    const standalone = alone.querySelector('[aria-label="Seule"]');
    expect(standalone && getComputedStyle(standalone).boxShadow).toBeTruthy();

    cleanup();
    const { container: grouped } = render(
      <ListRow.Group>
        <ListRow label="Membre" />
      </ListRow.Group>,
    );
    const member = grouped.querySelector('[aria-label="Membre"]');
    expect(member && getComputedStyle(member).boxShadow).toBeFalsy();
  });
});
