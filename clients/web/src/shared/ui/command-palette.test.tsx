// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CommandDef, CommandMenuProvider, useCommands } from '#web/shared/lib/command-menu';
import { readCommandUsage, recordCommandUse } from '#web/shared/lib/command-usage';
import { CommandPalette } from './command-palette';

const mocks = vi.hoisted(() => ({
  user: { id: 'viewer', permissions: ['requests.create'] } as object | null,
}));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

const { render, clearPressGuard } = createInputTestHost();

const noMenu = () => Promise.resolve(() => null);

const action = (label: string, extra: Partial<CommandDef> = {}) =>
  ({ label, group: 'More', run: vi.fn(), ...extra }) as CommandDef;

const HOME = { label: 'Accueil', group: 'Discover', to: '/' } as CommandDef;
const MOVIES = { label: 'Films', group: 'Discover', to: '/movies' } as CommandDef;

function Contributes({ commands }: Readonly<{ commands: readonly CommandDef[] }>) {
  useCommands(commands);
  return null;
}

async function show(commands: readonly CommandDef[]) {
  const root = createRootRoute();
  const page = (path: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => (
        <CommandMenuProvider load={noMenu}>
          <Contributes commands={commands} />
          <CommandPalette />
        </CommandMenuProvider>
      ),
    });
  const router = createRouter({
    routeTree: root.addChildren([page('/'), page('/movies')]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(
    <I18nProvider locale="en">
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  await screen.findByRole('dialog');
  return router;
}

const type = (text: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });

const key = (name: string) => fireEvent.keyDown(document, { key: name });

const row = (name: string) => screen.queryByRole('button', { name });

const rows = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => !['Close the menu', 'Actions', 'Open page', 'Run'].includes(label ?? ''));

beforeEach(() => {
  localStorage.clear();
  clearPressGuard();
  mocks.user = { id: 'viewer', permissions: ['requests.create'] };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the command palette', () => {
  it('lists what was contributed', async () => {
    await show([HOME, MOVIES]);

    await waitFor(() => expect(rows()).toEqual(['Accueil', 'Films']));
  });

  it('finds a label with two letters swapped', async () => {
    await show([HOME, action('Réseau')]);

    type('resaeu');

    await waitFor(() => expect(rows()).toEqual(['Réseau']));
  });

  it('finds a label by its initials', async () => {
    await show([HOME, action('Mises à jour')]);

    type('mj');

    await waitFor(() => expect(rows()).toEqual(['Mises à jour']));
  });

  it('puts first what the viewer chose before for those letters', async () => {
    recordCommandUse('viewer', 'More:Résumé', 're');
    await show([action('Réseau'), action('Résumé')]);

    type('re');

    await waitFor(() => expect(rows()).toEqual(['Résumé', 'Réseau']));
  });

  it('never lists a row for having been chosen, only for matching', async () => {
    recordCommandUse('viewer', 'More:Résumé', 'zz');
    await show([action('Réseau'), action('Résumé')]);

    type('zz');

    await waitFor(() => expect(rows()).toEqual([]));
  });

  it('remembers what was chosen, and what had been typed', async () => {
    await show([action('Réseau')]);
    type('res');
    await waitFor(() => expect(rows()).toEqual(['Réseau']));

    key('Enter');

    expect(readCommandUsage('viewer')['More:Réseau']?.queries).toEqual({ res: 1 });
  });

  it('says at its foot that a row opens a page', async () => {
    await show([HOME]);

    await waitFor(() => expect(row('Open page')).not.toBeNull());
  });

  it('says at its foot that a row runs', async () => {
    await show([action('Scan')]);

    await waitFor(() => expect(row('Run')).not.toBeNull());
  });

  it('says at its foot what a row says it does', async () => {
    await show([{ ...HOME, primaryLabel: 'Back home' } as CommandDef]);

    await waitFor(() => expect(row('Back home')).not.toBeNull());
  });

  it('hides a row this viewer may not have', async () => {
    await show([HOME, action('Réseau', { cap: 'settings.manage' })]);

    await waitFor(() => expect(row('Accueil')).not.toBeNull());
    expect(row('Réseau')).toBeNull();
  });

  it('opens the route under the cursor on Enter', async () => {
    const router = await show([HOME, MOVIES]);
    await waitFor(() => expect(row('Films')).not.toBeNull());

    key('ArrowDown');
    key('Enter');

    await waitFor(() => expect(router.state.location.pathname).toBe('/movies'));
  });

  it('runs the function of a row that was pressed', async () => {
    const scan = action('Analyser');
    await show([scan]);

    fireEvent.click((await screen.findByRole('button', { name: 'Analyser' })) as HTMLElement);

    await waitFor(() => expect(scan.run).toHaveBeenCalledTimes(1));
  });

  it('finds a French label typed without its accents', async () => {
    await show([HOME, action('Réseau')]);
    await waitFor(() => expect(row('Réseau')).not.toBeNull());

    type('reseau');

    await waitFor(() => expect(rows()).toEqual(['Réseau']));
  });

  it('finds a row by a keyword it does not show', async () => {
    await show([HOME, action('Réseau', { keywords: 'vpn pare-feu' })]);
    await waitFor(() => expect(row('Réseau')).not.toBeNull());

    type('vpn');

    await waitFor(() => expect(rows()).toEqual(['Réseau']));
  });

  it('finds an episode by the show named on its second line', async () => {
    await show([HOME, action('Secrets', { subtitle: 'Dark · S01E02' })]);
    await waitFor(() => expect(row('Secrets')).not.toBeNull());

    type('dark');

    await waitFor(() => expect(rows()).toEqual(['Secrets']));
  });

  it('keeps a row marked always, below what matched', async () => {
    await show([action('Partout', { always: true }), action('Films')]);
    await waitFor(() => expect(row('Films')).not.toBeNull());

    type('film');

    await waitFor(() => expect(rows()).toEqual(['Films', 'Partout']));
  });

  it('draws nothing for a viewer who is signed out', async () => {
    mocks.user = null;
    const root = createRootRoute({ component: () => <CommandPalette /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    await router.load();

    render(
      <I18nProvider locale="en">
        <RouterProvider router={router} />
      </I18nProvider>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
