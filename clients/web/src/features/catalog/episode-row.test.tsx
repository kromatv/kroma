// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
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

  it('says the date is unknown when the listing has none', () => {
    row({ episode: 9, title: 'Untitled', airDate: null });

    expect(screen.getByText('Unknown date')).toBeTruthy();
  });

  it('keeps the listing on a row already asked for', () => {
    row({ episode: 9, title: 'The Wedding', airDate: '2031-03-14' }, true);

    expect(screen.getByText('9. The Wedding')).toBeTruthy();
    expect(screen.getByText(/2031/)).toBeTruthy();
  });
});
