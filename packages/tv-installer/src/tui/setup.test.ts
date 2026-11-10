import { note } from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localSubnets } from '../discovery/lan';
import type { TvModule } from '../modules/module';
import { moduleFor } from '../modules/registry';
import { setupText, showSetup } from './setup';

vi.mock('@clack/prompts', () => ({ note: vi.fn() }));
vi.mock('../discovery/lan', () => ({ localSubnets: vi.fn() }));
vi.mock('../modules/registry', () => ({ moduleFor: vi.fn() }));

const kind = (over: Partial<TvModule>): TvModule => ({
  id: 'tizen',
  label: 'Samsung',
  brands: 'Samsung',
  package: '.wgt',
  notReadyHint: '',
  tools: () => [],
  sources: () => [],
  resolve: () => Promise.resolve(''),
  install: () => Promise.resolve(),
  ...over,
});

const samsung = kind({
  setup: (computer) => ['Open Apps.', `Enter ${computer ?? 'this computer'} as the host PC IP.`],
  guide: 'samsung-tv',
});
const lg = kind({ id: 'webos', label: 'LG', setup: () => ['Turn on Key Server.'] });
const appleTv = kind({ id: 'appletv', label: 'Apple TV' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupText', () => {
  it('numbers the steps of one kind of TV, with this computer address and the guide', () => {
    expect(setupText([samsung], '192.168.1.20')).toEqual({
      title: 'Once, on the Samsung TV',
      body: [
        '1. Open Apps.',
        '2. Enter 192.168.1.20 as the host PC IP.',
        'Step by step: https://kroma.tv/docs/samsung-tv',
      ].join('\n'),
    });
  });

  it('lets a kind say what to enter when this computer has no address', () => {
    expect(setupText([samsung], null)?.body).toContain('Enter this computer as the host PC IP.');
  });

  it('gives each kind its own section when several are looked for', () => {
    expect(setupText([samsung, lg, appleTv], '192.168.1.20')).toEqual({
      title: 'Once, on each TV',
      body: [
        'Samsung',
        '1. Open Apps.',
        '2. Enter 192.168.1.20 as the host PC IP.',
        'Step by step: https://kroma.tv/docs/samsung-tv',
        '',
        'LG',
        '1. Turn on Key Server.',
      ].join('\n'),
    });
  });

  it('says nothing for kinds that need nothing on the TV', () => {
    expect(setupText([appleTv], '192.168.1.20')).toBeNull();
  });
});

describe('showSetup', () => {
  it('shows the steps with the address of the first network this computer is on', () => {
    vi.mocked(moduleFor).mockReturnValue(samsung);
    vi.mocked(localSubnets).mockReturnValue([
      { iface: 'en0', address: '192.168.1.20', prefix: '192.168.1' },
      { iface: 'en7', address: '10.0.0.4', prefix: '10.0.0' },
    ]);

    showSetup(['tizen']);

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining('Enter 192.168.1.20 as the host PC IP.'),
      'Once, on the Samsung TV',
    );
  });

  it('shows nothing when no chosen kind needs a step', () => {
    vi.mocked(moduleFor).mockReturnValue(appleTv);
    vi.mocked(localSubnets).mockReturnValue([]);

    showSetup(['appletv']);

    expect(note).not.toHaveBeenCalled();
  });
});
