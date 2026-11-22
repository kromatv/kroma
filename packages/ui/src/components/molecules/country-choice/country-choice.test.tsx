// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { CountryChoice } from './country-choice.component';

afterEach(cleanup);

describe('CountryChoice', () => {
  it('offers one row per country, named and sorted by name', () => {
    render(
      onScreen(
        <CountryChoice
          label="Country"
          countries={['US', 'CH', 'DE']}
          value={null}
          onValueChange={vi.fn()}
        />,
      ),
    );

    const names = screen.getAllByRole('radio').map((row) => row.textContent);

    expect(names).toEqual(['Germany', 'Switzerland', 'United States']);
  });

  it('shows the country it was given as the one picked, and hands back the one pressed', () => {
    const picked = vi.fn();
    render(
      onScreen(
        <CountryChoice
          label="Country"
          countries={['CH', 'DE']}
          value="CH"
          onValueChange={picked}
        />,
      ),
    );

    const [germany, switzerland] = screen.getAllByRole('radio');
    fireEvent.click(germany ?? document.body);

    expect(switzerland?.getAttribute('aria-checked')).toBe('true');
    expect(picked).toHaveBeenCalledWith('DE');
  });
});
