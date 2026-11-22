// @vitest-environment jsdom
import { StorePlan } from '@kromatv/client/modules';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PlanBody, planSubtitle } from '#web/features/admin/module-install-plan';
import { englishT } from '#web/features/admin/module-permissions.fixture';

const inputHost = createInputTestHost();

afterEach(cleanup);

const row = (id: string, name: string, permissions: Record<string, unknown>) => ({
  id: `tv.kroma.${id}`,
  name,
  version: '0.4.0',
  size: 4_000_000,
  requested: false,
  official: true,
  permissions,
});

const PLAN = StorePlan.parse({
  requested: 'tv.kroma.acquisition',
  modules: [
    row('indexer', 'Indexers', { net: { connect: [{ purpose: 'indexer', to: ['public'] }] } }),
    row('torrents', 'Torrents', {
      run: ['rqbit', 'curl'],
      net: { host: true, connect: [{ purpose: 'peers', to: ['public'] }] },
      fs: { read: ['downloads'], write: ['downloads'] },
    }),
    { ...row('acquisition', 'Acquisition', {}), requested: true },
    row('vpn', 'VPN', { run: ['wireproxy'], net: { host: true } }),
  ],
  optional: [
    {
      id: 'tv.kroma.vpn',
      name: 'VPN',
      version: '0.4.0',
      point: 'network',
      for: 'Indexers',
      suggested: true,
    },
  ],
  missing: [],
  totalSize: 16_000_000,
});

function show() {
  inputHost.render(
    <I18nProvider locale="fr">
      <PlanBody
        plan={PLAN}
        error={null}
        optional={PLAN.optional}
        include={['tv.kroma.vpn']}
        onIncludeChange={() => {}}
        icons={{}}
        installed={[]}
      />
    </I18nProvider>,
  );
}

it('lists every module once, with the optional one ticked in the same list', () => {
  show();

  expect(screen.getAllByText('VPN')).toHaveLength(1);
  expect(screen.getAllByText('Requis')).toHaveLength(2);
  expect(screen.getByText('Conseillé pour Indexers')).toBeTruthy();
  expect(screen.getByRole('checkbox', { checked: true })).toBeTruthy();
});

it('says once for every module what reaches past its isolation', () => {
  show();

  expect(screen.getByText('Ce que ces modules pourront faire')).toBeTruthy();
  expect(screen.getByText('2 modules ont un accès étendu')).toBeTruthy();
  expect(screen.getByText(/^VPN lance wireproxy sur votre serveur/)).toBeTruthy();
  expect(screen.queryByText('Accès étendu')).toBeNull();
  expect(screen.getByText('Accéder à Internet')).toBeTruthy();
  expect(screen.getByText('Détail par module')).toBeTruthy();
});

const bytes = () => '16 MB';

it('counts what an install requires, and leaves the optional module out of it', () => {
  const t = englishT();

  expect(planSubtitle(PLAN, PLAN.optional, bytes, t)).toBe('With 2 required modules · 16 MB');
  expect(planSubtitle({ ...PLAN, totalSize: 0 }, PLAN.optional, bytes, t)).toBe(
    'With 2 required modules',
  );
});

const TORRENTS = {
  id: 'tv.kroma.torrents',
  name: 'Torrents',
  version: '0.6.33',
  requested: true,
  official: true,
  permissions: { run: ['rqbit'], net: { connect: [{ purpose: 'peers', to: ['public'] }] } },
  storage: { core: { read: ['downloads', 'users.email'] } },
  settings: { read: ['rqbitPort'] },
  helpers: {},
};

function showOne(module: Record<string, unknown>) {
  const plan = StorePlan.parse({
    requested: TORRENTS.id,
    modules: [module],
    optional: [],
    missing: [],
    totalSize: 0,
  });
  inputHost.render(
    <I18nProvider locale="fr">
      <PlanBody
        plan={plan}
        error={null}
        optional={[]}
        include={[]}
        onIncludeChange={() => {}}
        icons={{}}
        installed={[]}
      />
    </I18nProvider>,
  );
}

it('shows the account data a catalog row reaches before the module is installed', () => {
  showOne(TORRENTS);

  expect(screen.getByText('Lire les comptes')).toBeTruthy();
  expect(screen.getByText('Adresse e-mail')).toBeTruthy();
  expect(screen.getByText('Lire la base de données du serveur')).toBeTruthy();
});

it('says less for a row from a catalog that predates storage and settings', () => {
  const { storage: _s, settings: _t, helpers: _h, ...older } = TORRENTS;

  showOne(older);

  expect(screen.getByText('Accéder à Internet')).toBeTruthy();
  expect(screen.queryByText('Lire les comptes')).toBeNull();
});

it('calls a row with no permissions block isolated, and still shows the storage it declares', () => {
  const { permissions: _p, ...silent } = TORRENTS;

  showOne(silent);

  expect(screen.getByText('Isolé')).toBeTruthy();
  expect(screen.queryByText('Accéder à Internet')).toBeNull();
  expect(screen.getByText('Lire les comptes')).toBeTruthy();
});

it('calls a row that declares nothing isolated, since it gets no network', () => {
  const { permissions: _p, storage: _s, settings: _t, ...silent } = TORRENTS;

  showOne(silent);

  expect(screen.getByText('Isolé')).toBeTruthy();
  expect(screen.getByText("Ne déclare rien : il n'a ni réseau ni programme.")).toBeTruthy();
});
