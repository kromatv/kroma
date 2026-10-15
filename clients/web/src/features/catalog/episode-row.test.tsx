// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MissingEpisodeRow } from './episode-row';

vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(cleanup);

function row(listed: Parameters<typeof MissingEpisodeRow>[0]['listed'], pending = false) {
  return render(
    <I18nProvider locale="en">
      <MissingEpisodeRow
        season={1}
        episode={9}
        listed={listed}
        pending={pending}
        selected={false}
        onToggle={() => {}}
        watch={null}
      />
    </I18nProvider>,
  );
}

function playableRow(onToggle: () => void) {
  return render(
    <I18nProvider locale="en">
      <MissingEpisodeRow
        season={1}
        episode={9}
        listed={null}
        pending={false}
        selected={false}
        onToggle={onToggle}
        watch={<View />}
      />
    </I18nProvider>,
  );
}

describe('MissingEpisodeRow', () => {
  it('names a gap nothing is listed for by its number alone', () => {
    row(null);

    expect(screen.getByText('Episode 9')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.queryByText(/Unknown date/)).toBeNull();
  });

  it('shows the listed title, synopsis and the day it airs', () => {
    row({
      episode: 9,
      title: 'The Wedding',
      overview: 'Bert finds love.',
      airDate: '2031-03-14',
      stillUrl: '/api/images/still.webp',
    });

    expect(screen.getByText('9. The Wedding')).toBeTruthy();
    expect(screen.getByText('Bert finds love.')).toBeTruthy();
    expect(screen.getByText(/Mar 14, 2031/)).toBeTruthy();
    expect(screen.queryByText('9')).toBeNull();
  });

  it('shows the runtime the provider lists next to the day it airs', () => {
    row({
      episode: 9,
      title: 'The Wedding',
      overview: null,
      airDate: '2031-03-14',
      stillUrl: null,
      runtimeMin: 48,
    });

    expect(screen.getByText(/Mar 14, 2031 · 48min/)).toBeTruthy();
  });

  it('says the date is unknown when the listing has none', () => {
    row({ episode: 9, title: 'Untitled', airDate: null });

    expect(screen.getByText('Unknown date')).toBeTruthy();
  });

  it('does not pick the row when the play control is pressed', () => {
    const onToggle = vi.fn();
    playableRow(onToggle);

    fireEvent.click(screen.getByLabelText('Play'));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('picks the row when the row itself is pressed', () => {
    const onToggle = vi.fn();
    playableRow(onToggle);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('leaves the play control outside the control that picks the row', () => {
    playableRow(() => {});

    expect(screen.getByRole('checkbox').contains(screen.getByLabelText('Play'))).toBe(false);
  });

  it('keeps the listing on a row already asked for', () => {
    row({ episode: 9, title: 'The Wedding', airDate: '2031-03-14' }, true);

    expect(screen.getByText('9. The Wedding')).toBeTruthy();
    expect(screen.getByText(/2031/)).toBeTruthy();
  });
});
