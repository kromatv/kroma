// @vitest-environment jsdom
import type { MediaItem } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpisodeRow } from './EpisodeRow';

const episode = {
  id: 'ep1',
  title: 'Pilot',
  episodeTitle: 'Pilot',
  episode: 1,
  durationMs: 45 * 60_000,
  metadata: { overview: 'Jack wakes in the jungle and finds the other survivors.' },
} as unknown as MediaItem;

function row(
  over: {
    watched?: boolean;
    progress?: number | null;
    onToggleWatched?: () => void;
    onReport?: () => void;
    item?: MediaItem;
  } = {},
) {
  return render(
    onScreen(
      <I18nProvider locale="en">
        <EpisodeRow
          episode={over.item ?? episode}
          still={null}
          watched={over.watched ?? false}
          progress={over.progress ?? null}
          onPlay={() => undefined}
          onToggleWatched={over.onToggleWatched ?? (() => undefined)}
          onReport={over.onReport ?? (() => undefined)}
        />
      </I18nProvider>,
    ),
  );
}

afterEach(cleanup);

describe('EpisodeRow', () => {
  it('shows the recap next to the still, with the number and runtime as chips on it', () => {
    row();
    expect(screen.getByText('Pilot')).toBeTruthy();
    expect(screen.getByText(/Jack wakes in the jungle/)).toBeTruthy();
    expect(screen.getByText('Episode 1')).toBeTruthy();
    expect(screen.getByText('45min')).toBeTruthy();
    expect(screen.getByText(/ends at/)).toBeTruthy();
  });

  it("offers the row's three actions as buttons: play, mark watched, report", () => {
    const onToggleWatched = vi.fn();
    const onReport = vi.fn();
    row({ onToggleWatched, onReport });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Play')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Mark as watched'));
    expect(onToggleWatched).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Report'));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('turns the toggle into "Watched" once the episode is seen, and says so in a pill', () => {
    row({ watched: true });
    // The button and the title pill both carry the word.
    expect(screen.getAllByText('Watched').length).toBeGreaterThanOrEqual(2);
  });

  it('offers Resume instead of Play for an episode mid-way, flagged in progress', () => {
    row({ progress: 40 });
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('drops the recap line when the episode has no synopsis', () => {
    row({ item: { ...episode, metadata: null } as unknown as MediaItem });
    expect(screen.getByText('Pilot')).toBeTruthy();
    expect(screen.queryByText(/Jack wakes in the jungle/)).toBeNull();
  });
});
