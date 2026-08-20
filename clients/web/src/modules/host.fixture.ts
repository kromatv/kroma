import { afterEach, beforeEach, vi } from 'vitest';

export const sessionToken = vi.fn(() => 'tok' as string | null);
export const hasPermission = vi.fn(() => true);
export const createEventBus = vi.fn(() => ({ on: vi.fn(), emit: vi.fn() }));
export const t = vi.fn((key: string, vars?: unknown) => `t:${key}:${JSON.stringify(vars)}`);
export const locale = { value: 'en' };
export const navigate = vi.fn();
export const registry = {
  start: vi.fn(async (base: unknown, _skipSetup?: ReadonlySet<string>) => ({
    ...(base as object),
    getModuleApi: () => undefined,
  })),
};
export const loadRuntimeRemotes = vi.fn(async () => undefined);
export const auth = { user: null as { id: string } | null };

export function base() {
  const call = registry.start.mock.calls.at(-1);
  if (!call) throw new Error('the registry was never started');
  return call[0] as {
    api: { get(path: string): Promise<unknown>; listModules(): Promise<unknown> };
    auth: { userId: string | null; can(capability: string): boolean };
    i18n: { t(key: string, vars?: unknown): string; locale: string };
    nav: { navigate(to: string): void };
    bus: unknown;
  };
}

export const fetchMock = vi.fn();

export const answers = (body: unknown, ok = true, status = 200) =>
  fetchMock.mockResolvedValue({ ok, status, json: async () => body });

/** Registers the per-test reset every `useModuleHost` suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'u1' };
    locale.value = 'en';
    sessionToken.mockReturnValue('tok');
    hasPermission.mockReturnValue(true);
    registry.start.mockImplementation(async (b: unknown) => ({
      ...(b as object),
      getModuleApi: () => undefined,
    }));
    answers([]);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
