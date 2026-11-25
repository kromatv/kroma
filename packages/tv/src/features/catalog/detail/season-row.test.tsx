// @vitest-environment jsdom
import { Season } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeasonRow } from './season-row.component';

const seasons = [
  Season.parse({ number: 1, episodes: [], posterUrl: '/api/images/beside-s1.webp' }),
  Season.parse({ number: 2, episodes: [] }),
];

function row(onPick: (number: number) => void = () => undefined) {
  return render(
    onScreen(
      <I18nProvider locale="en">
        <SeasonRow
          seasons={seasons}
          current={2}
          posterFor={(season) => season.posterUrl ?? '/show.webp'}
          onPick={onPick}
        />
      </I18nProvider>,
    ),
  );
}

afterEach(cleanup);

describe('SeasonRow', () => {
  it('draws one poster a season and picks the season on screen', () => {
    row();

    const first = screen.getByRole('button', { name: 'Season 1' });
    const second = screen.getByRole('button', { name: 'Season 2' });
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(second.getAttribute('aria-selected')).toBe('true');
  });

  it('opens the season pressed', () => {
    const onPick = vi.fn();
    row(onPick);

    fireEvent.click(screen.getByRole('button', { name: 'Season 1' }));

    expect(onPick).toHaveBeenCalledWith(1);
  });
});
