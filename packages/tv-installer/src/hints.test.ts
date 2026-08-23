import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnoseEmptyScan } from './hints';
import { localNetworkBlocked, responsibleApp } from './local-network';
import type { TvModule } from './modules/module';
import { modules } from './modules/registry';

vi.mock('./local-network', () => ({ localNetworkBlocked: vi.fn(), responsibleApp: vi.fn() }));
vi.mock('./modules/registry', () => ({ modules: vi.fn() }));

const module = (label: string, enableSteps?: string): TvModule => ({
  id: label.toLowerCase(),
  label,
  brands: label,
  package: `tv.kroma.${label.toLowerCase()}`,
  notReadyHint: '',
  enableSteps,
  tools: () => [],
  sources: () => [],
  resolve: () => Promise.resolve(''),
  install: () => Promise.resolve(),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(localNetworkBlocked).mockResolvedValue(false);
  vi.mocked(responsibleApp).mockResolvedValue(null);
  vi.mocked(modules).mockReturnValue([
    module('Samsung', 'Apps panel, 12345, Developer mode on'),
    module('LG', 'install Developer Mode and sign in'),
    module('Apple TV'),
  ]);
});

describe('diagnoseEmptyScan', () => {
  it('blames the permission when macOS is refusing the local network', async () => {
    vi.mocked(localNetworkBlocked).mockResolvedValue(true);
    vi.mocked(responsibleApp).mockResolvedValue('Ghostty');

    const { blocked, hints } = await diagnoseEmptyScan();

    expect(blocked).toBe(true);
    expect(hints[0]).toContain('Ghostty');
  });

  it('blames the terminal itself when no application owns the process', async () => {
    vi.mocked(localNetworkBlocked).mockResolvedValue(true);

    const { hints } = await diagnoseEmptyScan();

    expect(hints[0]).toContain('this terminal');
  });

  it('says how to turn developer mode on when nothing is blocking', async () => {
    const { blocked, hints } = await diagnoseEmptyScan();

    expect(blocked).toBe(false);
    expect(hints.join(' ')).toContain('Samsung: Apps panel, 12345, Developer mode on');
  });

  it('leaves out a platform that asks for nothing to be turned on', async () => {
    const { hints } = await diagnoseEmptyScan();

    expect(hints.join(' ')).not.toContain('Apple TV');
  });

  it('still says how to turn developer mode on when the permission is denied', async () => {
    vi.mocked(localNetworkBlocked).mockResolvedValue(true);

    const { hints } = await diagnoseEmptyScan();

    expect(hints.join(' ')).toContain('LG: install Developer Mode and sign in');
  });
});
