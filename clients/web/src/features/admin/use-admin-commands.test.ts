// @vitest-environment jsdom
import type { Permission } from '@kromatv/client/accounts';
import type { ModuleNav } from '@kromatv/module-sdk';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef } from '#web/shared/lib/command-menu';
import { NAV_GROUPS } from './admin-nav';
import { useAdminCommands } from './use-admin-commands';

const mocks = vi.hoisted(() => ({
  commands: [] as readonly CommandDef[],
  moduleNav: [] as ModuleNav[],
  installed: [] as object[],
  query: '',
  user: { permissions: [] as string[] } as { permissions: string[] } | null,
  client: {} as object,
  toast: vi.fn(),
  invalidateQueries: vi.fn(),
  moduleApi: { fetchAdminModules: vi.fn() },
}));
vi.mock('@kromatv/ui', async (original) => ({
  ...(await original<typeof import('@kromatv/ui')>()),
  useT: () => (key: string) => key,
}));
vi.mock('@kromatv/ui/kit', async (original) => ({
  ...(await original<typeof import('@kromatv/ui/kit')>()),
  toast: mocks.toast,
  useConfirm: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({ data: mocks.installed }),
}));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ user: mocks.user, client: mocks.client }),
}));
vi.mock('#web/modules/ModuleHostProvider', () => ({
  useModuleNavAll: () => mocks.moduleNav,
  useRefreshModules: () => vi.fn(),
}));
vi.mock('#web/shared/lib/web-runtime', () => ({
  useWebRuntime: () => ({ moduleApi: mocks.moduleApi }),
}));
vi.mock('#web/shared/lib/command-menu', () => ({
  useCommandQuery: () => mocks.query,
  useCommands: (commands: readonly CommandDef[]) => {
    mocks.commands = commands;
  },
}));

const modulePage = (to: string, section?: string): ModuleNav => ({
  moduleId: 'tv.kroma.torrents',
  to,
  label: to,
  ...(section === undefined ? {} : { section }),
});

function offeredTo(...permissions: Permission[]): readonly CommandDef[] {
  mocks.user = { permissions };
  renderHook(() => useAdminCommands());
  return mocks.commands;
}

const routes = (commands: readonly CommandDef[]) => commands.map((command) => command.to);

const pageAt = (commands: readonly CommandDef[], to: string) =>
  commands.find((command) => command.to === to);

const action = (commands: readonly CommandDef[], label: string) =>
  commands.find((command) => command.label === label);

beforeEach(() => {
  mocks.moduleNav = [];
  mocks.installed = [];
  mocks.query = '';
  mocks.client = {};
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('the console in the command menu', () => {
  it('lists every page of the navigation for a viewer who may use them all', () => {
    const everything = offeredTo(
      'users.manage',
      'reports.manage',
      'library.manage',
      'requests.manage',
      'settings.manage',
    );

    const pages = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));

    expect(routes(everything)).toEqual(expect.arrayContaining(pages));
  });

  it('shows nothing of the console to a viewer who is no admin', () => {
    expect(offeredTo('requests.create')).toEqual([]);
  });

  it('shows nothing to a capability the console would turn away at its door', () => {
    expect(offeredTo('reports.manage')).toEqual([]);
  });

  it('gives any admin the read-only pages', () => {
    expect(routes(offeredTo('requests.manage'))).toEqual(
      expect.arrayContaining(['/admin', '/admin/logs']),
    );
  });

  it('holds back a page another capability guards', () => {
    expect(routes(offeredTo('requests.manage'))).not.toContain('/admin/network');
  });

  it('gives a page guarded by a list to a holder of any one of them', () => {
    expect(routes(offeredTo('requests.manage'))).toContain('/admin/monitoring');
  });

  it('files a page under the heading its sidebar group has', () => {
    const logs = pageAt(offeredTo('requests.manage'), '/admin/logs');

    expect(logs?.group).toBe('admin.groupMaintenance');
  });

  it('files a module page in the group its section names', () => {
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];

    const page = pageAt(offeredTo('settings.manage'), '/admin/downloads');

    expect(page?.group).toBe('admin.groupAcquisition');
  });

  it('files a module page whose section names no group under module pages', () => {
    mocks.moduleNav = [modulePage('/admin/odd', 'nowhere')];

    const page = pageAt(offeredTo('settings.manage'), '/admin/odd');

    expect(page?.group).toBe('admin.groupModulePages');
  });

  it('gives nothing of a module’s console pages to a viewer who is no admin', () => {
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];

    expect(offeredTo()).toEqual([]);
  });
});

describe('an installed module in the command menu', () => {
  const WHISPER = {
    id: 'tv.kroma.whisper',
    name: 'Whisper',
    version: '1.2.0',
    description: 'Writes subtitles',
    enabled: true,
    running: true,
    hasSidecar: true,
    removable: true,
  };

  const moduleRows = (commands: readonly CommandDef[]) =>
    commands.filter((command) => command.id?.startsWith('module:'));

  it('is not listed before anything is typed, so it does not bury the pages', () => {
    mocks.installed = [WHISPER];

    expect(moduleRows(offeredTo('settings.manage'))).toEqual([]);
  });

  it('opens on its settings once something is typed', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]).toMatchObject({
      label: 'Whisper',
      to: '/admin/modules/$id',
      params: { id: 'tv.kroma.whisper' },
    });
  });

  it('is findable by its id, by what it does and by its status', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'kroma';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.keywords).toBe(
      'tv.kroma.whisper Writes subtitles admin.modulesEnabled',
    );
  });

  it('says what it is and its version, keeping what it does off the row', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.subtitle).toBe(
      'commands.moduleKind · v1.2.0',
    );
  });

  it('wears its own icon as a square tile', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    const row = moduleRows(offeredTo('settings.manage'))[0];

    expect(row?.image).toContain('/api/modules/tv.kroma.whisper/icon');
    expect(row?.imageShape).toBe('tile');
  });

  it('says it opens on its settings', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.primaryLabel).toBe(
      'commands.moduleSettings',
    );
  });

  it('shows in green that it runs as it should', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.status).toEqual({
      label: 'admin.modulesEnabled',
      tone: 'success',
    });
  });

  it('shows quietly that it is turned off, which is a choice', () => {
    mocks.installed = [{ ...WHISPER, enabled: false, running: false }];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.status).toEqual({
      label: 'admin.modulesDisabled',
      tone: 'neutral',
    });
  });

  it('shows in red that its process has stopped', () => {
    mocks.installed = [{ ...WHISPER, running: false }];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.status).toEqual({
      label: 'admin.modulesNotRunning',
      tone: 'danger',
    });
  });

  it('does not call a library module stopped, as it has no process to stop', () => {
    mocks.installed = [{ ...WHISPER, running: false, hasSidecar: false }];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.status?.tone).toBe('success');
  });

  it('warns when something it needs is missing', () => {
    mocks.installed = [{ ...WHISPER, unmet: ['transcriber'] }];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.status).toEqual({
      label: 'admin.modulesUnmet',
      tone: 'warning',
    });
  });

  it('is listed once, by its page, when it has one', () => {
    mocks.installed = [{ ...WHISPER, id: 'tv.kroma.torrents' }];
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))).toEqual([]);
  });

  it('leaves its page a plain row of the console with nothing typed', () => {
    mocks.installed = [{ ...WHISPER, id: 'tv.kroma.torrents' }];
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];

    const page = pageAt(offeredTo('settings.manage'), '/admin/downloads');

    expect(page?.image).toBeUndefined();
    expect(page?.subtitle).toBeUndefined();
    expect(page?.status).toBeUndefined();
  });

  it('draws its page as a result while searching, naming the module the page belongs to', () => {
    mocks.installed = [{ ...WHISPER, id: 'tv.kroma.torrents' }];
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];
    mocks.query = 'down';

    const page = pageAt(offeredTo('settings.manage'), '/admin/downloads');

    expect(page?.image).toContain('/api/modules/tv.kroma.torrents/icon');
    expect(page?.subtitle).toBe('Whisper · v1.2.0');
  });

  it('calls a page named after its module a module, rather than saying the name twice', () => {
    mocks.installed = [{ ...WHISPER, id: 'tv.kroma.torrents' }];
    mocks.moduleNav = [{ ...modulePage('/admin/whisper'), label: 'Whisper' }];
    mocks.query = 'whis';

    const page = pageAt(offeredTo('settings.manage'), '/admin/whisper');

    expect(page?.subtitle).toBe('commands.moduleKind · v1.2.0');
  });

  it('asks for the capability its settings page asks for', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(moduleRows(offeredTo('settings.manage'))[0]?.cap).toBe('settings.manage');
  });

  it('is not offered to a viewer who is no admin', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    expect(offeredTo('requests.create')).toEqual([]);
  });

  it('can be acted on from its row', () => {
    mocks.installed = [WHISPER];
    mocks.query = 'whis';

    const actions = moduleRows(offeredTo('settings.manage'))[0]?.actions;

    expect(actions?.map((one) => one && one.label)).toEqual([
      'commands.moduleDisable',
      'admin.modulesRestart',
      'admin.modulesUninstall',
    ]);
  });

  it('lends its page its actions, and a way to its settings first', () => {
    mocks.installed = [{ ...WHISPER, id: 'tv.kroma.torrents' }];
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];

    const page = pageAt(offeredTo('settings.manage'), '/admin/downloads');

    expect(page?.actions?.map((one) => one && one.label)).toEqual([
      'commands.moduleSettings',
      'commands.moduleDisable',
      'admin.modulesRestart',
      'admin.modulesUninstall',
    ]);
  });

  it('leaves a module page with nothing to offer when the module is not listed', () => {
    mocks.moduleNav = [modulePage('/admin/downloads', 'acquisition')];

    expect(pageAt(offeredTo('settings.manage'), '/admin/downloads')?.actions).toEqual([]);
  });
});

describe('the console’s actions', () => {
  it('guards the library scan with its capability', () => {
    expect(action(offeredTo('library.manage'), 'commands.scanLibraries')?.cap).toBe(
      'library.manage',
    );
  });

  it('scans every library', async () => {
    const scan = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue({ libraries: [{ id: 'films' }, { id: 'series' }] });
    mocks.client = { library: { list, scan } };

    await action(offeredTo('library.manage'), 'commands.scanLibraries')?.run?.();

    expect(scan.mock.calls).toEqual([['films'], ['series']]);
  });

  it('says the scan started', () => {
    expect(action(offeredTo('library.manage'), 'commands.scanLibraries')?.done).toBe(
      'commands.scanStarted',
    );
  });

  it('reports an update it found', async () => {
    mocks.client = { admin: { checkUpdates: vi.fn().mockResolvedValue({ available: true }) } };

    await action(offeredTo('settings.manage'), 'admin.updatesCheck')?.run?.();

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'admin.updatesReady' }),
    );
  });

  it('reports that the server is up to date', async () => {
    mocks.client = { admin: { checkUpdates: vi.fn().mockResolvedValue({ available: false }) } };

    await action(offeredTo('settings.manage'), 'admin.updatesCheck')?.run?.();

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'admin.updatesCurrent' }),
    );
  });
});
