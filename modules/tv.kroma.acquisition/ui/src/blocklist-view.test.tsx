// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlocklistView } from './blocklist-view';
import type { BlockedRelease } from './judgement-schemas';

const mocks = vi.hoisted(() => ({ entries: [] as BlockedRelease[] }));

vi.mock('./api', () => ({ useAcquisitionApi: () => ({ unblock: vi.fn() }) }));
vi.mock('./use-rules', () => ({
  useBlocklist: () => ({ data: mocks.entries, loading: false, reload: vi.fn() }),
}));

const { render, clearPressGuard } = createInputTestHost();

const blocked = (count: number): BlockedRelease[] =>
  Array.from({ length: count }, (_, at) => ({
    id: `b${at}`,
    kind: 'show',
    tmdbId: at,
    releaseTitle: `Release.${at}`,
    reason: 'stalled',
    addedAt: at,
  }));

const view = () => (
  <I18nProvider locale="en">
    <BlocklistView />
  </I18nProvider>
);

beforeEach(clearPressGuard);

afterEach(cleanup);

describe('BlocklistView', () => {
  it('shows one page of a long list', () => {
    mocks.entries = blocked(30);

    render(view());

    expect(screen.getByText('Release.24')).toBeTruthy();
    expect(screen.queryByText('Release.25')).toBeNull();
  });

  it('reaches the rest of the list through the pager', () => {
    mocks.entries = blocked(30);
    render(view());

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(screen.getByText('Release.25')).toBeTruthy();
    expect(screen.queryByText('Release.0')).toBeNull();
  });

  it('draws no pager for a list that fits on one page', () => {
    mocks.entries = blocked(25);

    render(view());

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('falls back to the last page once its own entries are gone', () => {
    mocks.entries = blocked(26);
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    mocks.entries = blocked(25);
    rerender(view());

    expect(screen.getByText('Release.24')).toBeTruthy();
  });
});
