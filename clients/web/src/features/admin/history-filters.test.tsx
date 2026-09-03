// @vitest-environment jsdom

import { type AdminUser, LibraryId, UserId } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryFilters } from '#web/features/admin/history-filters';
import type { HistorySearch } from '#web/features/admin/history-query';

const LIBRARIES = [
  { id: LibraryId.parse('nas-films'), name: 'Films' },
  { id: LibraryId.parse('nas-series'), name: 'Séries' },
];

const USERS: AdminUser[] = [
  {
    id: UserId.parse('u1'),
    email: 'max@kroma.tv',
    username: 'maxime',
    permissions: [],
    role: 'Propriétaire',
    createdAt: '2026-01-01',
    online: true,
    emailVerified: false,
    hasPin: false,
    resetRequested: false,
  },
];

function mount(search: HistorySearch, pinnedTitle: string | null = null) {
  const onSearchChange = vi.fn();
  render(
    <I18nProvider locale="en">
      <HistoryFilters
        search={search}
        libraries={LIBRARIES}
        users={USERS}
        pinnedTitle={pinnedTitle}
        onSearchChange={onSearchChange}
      />
    </I18nProvider>,
  );
  return onSearchChange;
}

describe("the watch history's filters", () => {
  it('says it is showing every library before one is picked', () => {
    mount({});

    expect(screen.getByText('All libraries')).toBeTruthy();
  });

  it('says it is showing every member before one is picked', () => {
    mount({});

    expect(screen.getByText('Every member')).toBeTruthy();
  });

  it('names the library the address arrived with', () => {
    mount({ library: LibraryId.parse('nas-series') });

    expect(screen.getByText('Séries')).toBeTruthy();
  });

  it('names the account the address arrived with', () => {
    mount({ user: UserId.parse('u1') });

    expect(screen.getByText('maxime')).toBeTruthy();
  });

  it('names the title the screen is pinned to, so the short table has a reason', () => {
    mount({ item: 'hotd' }, 'House of the Dragon');

    expect(screen.getByText('House of the Dragon')).toBeTruthy();
  });

  it('names the filter rather than the raw id for a title nobody has played', () => {
    mount({ item: '7490cee4b06f25f6' }, null);

    expect(screen.getByText('Title')).toBeTruthy();
  });

  it('offers no title filter on a screen no title has narrowed', () => {
    mount({});

    expect(screen.queryByText('Title')).toBeNull();
  });

  it('drops the title in one press and leaves the other filters as they were', () => {
    const asked = mount(
      {
        item: 'hotd',
        library: LibraryId.parse('nas-series'),
        user: UserId.parse('u1'),
        range: '7d',
        page: 4,
      },
      'House of the Dragon',
    );

    fireEvent.click(screen.getByText('House of the Dragon'));

    expect(asked).toHaveBeenCalledWith({
      item: undefined,
      library: 'nas-series',
      user: 'u1',
      range: '7d',
      page: 1,
    });
  });
});
