// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { KidsLevelChoice } from './kids-level-choice.component';

afterEach(cleanup);

describe('KidsLevelChoice', () => {
  it('offers the three kids levels with none picked in advance', () => {
    render(onScreen(<KidsLevelChoice value={null} onValueChange={vi.fn()} />));

    const rows = screen.getAllByRole('radio');

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('hands back the level a row stands for', () => {
    const picked = vi.fn();
    render(onScreen(<KidsLevelChoice value={null} onValueChange={picked} />));

    fireEvent.click(screen.getAllByRole('radio')[2] ?? document.body);

    expect(picked).toHaveBeenCalledWith(10);
  });

  it('shows the level it was given as the one picked', () => {
    render(onScreen(<KidsLevelChoice value={7} onValueChange={vi.fn()} />));

    expect(screen.getAllByRole('radio')[1]?.getAttribute('aria-checked')).toBe('true');
  });
});
