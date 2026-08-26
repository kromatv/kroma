// @vitest-environment jsdom
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
import type { PosterAction } from './poster-action-bar';
import { PosterTile } from './poster-tile';
import { RouteLink } from './route-link';

afterEach(cleanup);

const ACTIONS: PosterAction[] = [
  { key: 'list', icon: 'bookmark', label: 'Add to list', onSelect: () => {} },
];

// Deliberately not the kit's `onScreen`, which mounts a <FocusScope>: the web
// client has none, so an unscoped tile is the path a browser takes.
function tile(watched: boolean) {
  return render(
    <I18nProvider locale="en">
      <PosterTile label="Dune" background="none" watched={watched} actions={ACTIONS}>
        {() => null}
      </PosterTile>
    </I18nProvider>,
  );
}

function Tile() {
  return (
    <I18nProvider locale="en">
      <PosterTile
        label="Dune"
        background="none"
        actions={ACTIONS}
        as={<RouteLink to="/movies/$id" params={{ id: 'dune' }} />}
      >
        {() => null}
      </PosterTile>
    </I18nProvider>
  );
}

async function routedTile() {
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: Tile });
  const fiche = createRoute({ getParentRoute: () => root, path: '/movies/$id', component: Tile });
  const router = createRouter({
    routeTree: root.addChildren([home, fiche]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

const art = () => screen.getByLabelText('Dune');

const bar = () => screen.getByRole('toolbar');

const disc = () => screen.getByLabelText('Add to list');

function foldLayer(): Element {
  const layer = screen.getByLabelText('Watched').parentElement;
  if (!layer) throw new Error('the watched fold has no layer to fade');
  return layer;
}

describe('PosterTile', () => {
  it('keeps the quick actions in the tab order while the bar is hidden', () => {
    tile(false);

    expect(getComputedStyle(bar()).opacity).toBe('0');
    expect(disc().tabIndex).toBe(0);
  });

  it('raises the bar when focus lands on a quick action', () => {
    tile(false);

    fireEvent.focus(disc());

    expect(getComputedStyle(bar()).opacity).toBe('1');
  });

  it('shows the watched fold while the bar is down', () => {
    tile(true);

    expect(getComputedStyle(foldLayer()).opacity).toBe('1');
  });

  it('stands the watched fold down while the bar is up, since the two share the corner', () => {
    tile(true);

    fireEvent.focus(disc());

    expect(getComputedStyle(foldLayer()).opacity).toBe('0');
  });
});

describe('a poster tile that names a route', () => {
  it('makes the artwork an anchor to the title', async () => {
    await routedTile();

    expect(art().tagName).toBe('A');
    expect(art().getAttribute('href')).toBe('/movies/dune');
  });

  it('keeps the quick actions out of the anchor, where a click would follow the href', async () => {
    await routedTile();

    expect(art().contains(disc())).toBe(false);
  });

  it('navigates once on a plain click, and no document loads', async () => {
    const router = await routedTile();

    const notPrevented = fireEvent.click(art(), { button: 0 });

    await waitFor(() => expect(router.state.location.pathname).toBe('/movies/dune'));
    expect(notPrevented).toBe(false);
  });

  it('leaves a cmd click to the browser, which is how a title opens in a tab', async () => {
    const router = await routedTile();

    const notPrevented = fireEvent.click(art(), { metaKey: true });

    expect(router.state.location.pathname).toBe('/');
    expect(notPrevented).toBe(true);
  });

  it('leaves a middle click to the browser', async () => {
    const router = await routedTile();

    const notPrevented = fireEvent.click(art(), { button: 1 });

    expect(router.state.location.pathname).toBe('/');
    expect(notPrevented).toBe(true);
  });
});
