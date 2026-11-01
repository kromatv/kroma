// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AdminModule, UninstallConflictError } from '#web/features/admin/module-api';
import type { CommandActionDef } from '#web/shared/lib/command-menu';
import { useModuleActions } from './use-module-actions';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
  refresh: vi.fn(),
  moduleApi: {
    fetchAdminModules: vi.fn(),
    setModuleEnabled: vi.fn(),
    restartModule: vi.fn(),
    uninstallModule: vi.fn(),
  },
}));
vi.mock('@kromatv/ui', async (original) => ({
  ...(await original<typeof import('@kromatv/ui')>()),
  useT: () => (key: string) => key,
}));
vi.mock('@kromatv/ui/kit', async (original) => ({
  ...(await original<typeof import('@kromatv/ui/kit')>()),
  toast: mocks.toast,
  useConfirm: () => mocks.confirm,
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [] }),
}));
vi.mock('#web/modules/ModuleHostProvider', () => ({ useRefreshModules: () => mocks.refresh }));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ user: { permissions: ['settings.manage'] } }),
}));
vi.mock('#web/shared/lib/web-runtime', () => ({
  useWebRuntime: () => ({ moduleApi: mocks.moduleApi }),
}));

const ROKU = {
  id: 'tv.kroma.roku',
  name: 'Roku',
  enabled: true,
  hasSidecar: true,
  removable: true,
} as AdminModule;

function actionsFor(module: AdminModule = ROKU): readonly CommandActionDef[] {
  const { result } = renderHook(() => useModuleActions());
  return result.current.actionsOf(module);
}

const named = (actions: readonly CommandActionDef[], label: string) =>
  actions.find((one) => one.label === label) as CommandActionDef & { run: () => Promise<void> };

const labels = (actions: readonly CommandActionDef[]) => actions.map((one) => one.label);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.moduleApi.setModuleEnabled.mockResolvedValue({ warning: null });
  mocks.moduleApi.restartModule.mockResolvedValue(undefined);
  mocks.moduleApi.uninstallModule.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('what the menu offers to do to a module', () => {
  it('offers to disable a module that runs, restart it and uninstall it', () => {
    expect(labels(actionsFor())).toEqual([
      'commands.moduleDisable',
      'admin.modulesRestart',
      'admin.modulesUninstall',
    ]);
  });

  it('offers to enable one that is off, and nothing to restart', () => {
    expect(labels(actionsFor({ ...ROKU, enabled: false }))).toEqual([
      'commands.moduleEnable',
      'admin.modulesUninstall',
    ]);
  });

  it('offers no restart for a module with no process to restart', () => {
    expect(labels(actionsFor({ ...ROKU, hasSidecar: false }))).not.toContain(
      'admin.modulesRestart',
    );
  });

  it('offers no uninstall for a module that cannot be removed', () => {
    expect(labels(actionsFor({ ...ROKU, removable: false }))).not.toContain(
      'admin.modulesUninstall',
    );
  });

  it('asks for the capability the module’s page asks for', () => {
    expect(actionsFor().every((one) => one.cap === 'settings.manage')).toBe(true);
  });

  it('marks the uninstall as dangerous and asks first', () => {
    expect(named(actionsFor(), 'admin.modulesUninstall')).toMatchObject({
      tone: 'danger',
      confirm: { title: 'admin.modulesUninstall' },
    });
  });
});

describe('running them', () => {
  it('disables a module that runs, then refreshes the host', async () => {
    await named(actionsFor(), 'commands.moduleDisable').run();

    expect(mocks.moduleApi.setModuleEnabled).toHaveBeenCalledWith('tv.kroma.roku', false);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('enables a module that is off', async () => {
    await named(actionsFor({ ...ROKU, enabled: false }), 'commands.moduleEnable').run();

    expect(mocks.moduleApi.setModuleEnabled).toHaveBeenCalledWith('tv.kroma.roku', true);
  });

  it('passes on a warning the server had about a change', async () => {
    mocks.moduleApi.setModuleEnabled.mockResolvedValue({ warning: 'Something depends on it.' });

    await named(actionsFor(), 'commands.moduleDisable').run();

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Something depends on it.', tone: 'plain' }),
    );
  });

  it('restarts a module', async () => {
    await named(actionsFor(), 'admin.modulesRestart').run();

    expect(mocks.moduleApi.restartModule).toHaveBeenCalledWith('tv.kroma.roku');
  });

  it('uninstalls a module and says so', async () => {
    await named(actionsFor(), 'admin.modulesUninstall').run();

    expect(mocks.moduleApi.uninstallModule).toHaveBeenCalledWith('tv.kroma.roku');
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'commands.moduleUninstalled' }),
    );
  });

  it('asks again before uninstalling what others depend on', async () => {
    mocks.moduleApi.uninstallModule.mockRejectedValueOnce(
      new UninstallConflictError('In use', ['tv.kroma.remote']),
    );
    mocks.confirm.mockResolvedValue(true);

    await named(actionsFor(), 'admin.modulesUninstall').run();

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(mocks.moduleApi.uninstallModule).toHaveBeenLastCalledWith('tv.kroma.roku', true);
  });

  it('keeps a module others depend on when told no the second time', async () => {
    mocks.moduleApi.uninstallModule.mockRejectedValueOnce(
      new UninstallConflictError('In use', ['tv.kroma.remote']),
    );
    mocks.confirm.mockResolvedValue(false);

    await named(actionsFor(), 'admin.modulesUninstall').run();

    expect(mocks.moduleApi.uninstallModule).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('says what went wrong rather than failing silently', async () => {
    mocks.moduleApi.restartModule.mockRejectedValue(new Error('It would not start.'));

    await named(actionsFor(), 'admin.modulesRestart').run();

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'It would not start.' }),
    );
  });
});
