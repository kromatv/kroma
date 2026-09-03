// @vitest-environment jsdom

import { type TopUser, UserId } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TopViewerCard } from '#web/features/admin/dashboard-top-viewer-card';
import { validateHistorySearch } from '#web/features/admin/history-query';

afterEach(cleanup);

const viewer = (fields: Partial<TopUser> = {}): TopUser => ({
  username: 'maxime',
  userId: UserId.parse('u-7'),
  plays: 12,
  watchedMs: 3_600_000,
  filmsMs: 1_200_000,
  tvMs: 2_400_000,
  ...fields,
});

async function stage(user: TopUser) {
  const root = createRootRoute();
  const dashboard = createRoute({
    getParentRoute: () => root,
    path: '/admin',
    component: () => (
      <I18nProvider locale="en">
        <TopViewerCard user={user} />
      </I18nProvider>
    ),
  });
  const history = createRoute({
    getParentRoute: () => root,
    path: '/admin/history',
    validateSearch: validateHistorySearch,
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([dashboard, history]),
    history: createMemoryHistory({ initialEntries: ['/admin'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

const card = () => screen.getByRole('link');

describe('a top viewer card', () => {
  it('names the member it would open the history of', async () => {
    await stage(viewer());

    expect(card().getAttribute('aria-label')).toBe('See playback history · maxime');
  });

  it('is a real anchor, so the browser can copy it or open it in its own tab', async () => {
    await stage(viewer());

    expect(card().tagName).toBe('A');
    expect(card().getAttribute('href')).toBe('/admin/history?user=u-7');
  });

  it('reads the play count and the time watched at rest', async () => {
    await stage(viewer());

    expect(screen.getByText('12 plays')).toBeTruthy();
  });

  it('opens every play that member has ever made, not the window the panel shows', async () => {
    const router = await stage(viewer());

    fireEvent.click(card());

    await waitFor(() => expect(router.state.location.href).toBe('/admin/history?user=u-7'));
  });

  it('offers the history in place of the totals while the pointer rests on it', async () => {
    await stage(viewer());

    fireEvent.pointerEnter(card());

    expect(screen.getByText('See playback history')).toBeTruthy();
    expect(screen.queryByText('12 plays')).toBeNull();
  });

  it('makes the same offer to a keyboard, so a tab stop does not look like its neighbours', async () => {
    await stage(viewer());

    fireEvent.focus(card());

    expect(screen.getByText('See playback history')).toBeTruthy();
    expect(screen.queryByText('12 plays')).toBeNull();
  });

  it('keeps the member and the breakdown in place under the offer', async () => {
    await stage(viewer());

    fireEvent.pointerEnter(card());

    expect(screen.getByText('maxime')).toBeTruthy();
    expect(screen.getByText('TV')).toBeTruthy();
  });

  it('stays a plain card for a play recorded against no account', async () => {
    await stage(viewer({ userId: null }));

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('maxime')).toBeTruthy();
  });
});
