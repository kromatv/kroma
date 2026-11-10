import { intro, note } from '@clack/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bannerText, invocation, showBanner } from './banner';

vi.mock('@clack/prompts', () => ({ intro: vi.fn(), note: vi.fn() }));
vi.mock('./ansi', () => ({ style: { bold: (text: string) => text, dim: (text: string) => text } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('invocation', () => {
  it('names npx and the published package when npx ran it', () => {
    expect(invocation({ npm_command: 'exec', npm_lifecycle_event: 'npx' })).toBe(
      'npx @kromatv/installer',
    );
  });

  it('names the repository script when bun run tv ran it', () => {
    expect(invocation({ npm_lifecycle_event: 'tv' })).toBe('bun run tv');
  });

  it('names the binary otherwise', () => {
    expect(invocation({})).toBe('kroma-tv');
  });
});

describe('bannerText', () => {
  it('puts the version beside the wordmark', () => {
    expect(bannerText('0.1.40', 'kroma-tv')[1]).toContain('TV installer 0.1.40');
  });

  it('leaves the version out when the run has none', () => {
    expect(bannerText(undefined, 'kroma-tv')[1]).toMatch(/TV installer$/);
  });

  it('lines the commands up under one another, typed as this run was started', () => {
    const help = bannerText(undefined, 'npx @kromatv/installer').slice(3);

    expect(help).toEqual([
      'npx @kromatv/installer update   update every TV installed from here',
      'npx @kromatv/installer --help   every command and option',
      'ctrl-c                          quit at any time',
    ]);
  });
});

describe('showBanner', () => {
  it('prints the wordmark, then says what the installer asks and how to get help', () => {
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));

    showBanner('0.1.40', 'kroma-tv');

    expect(printed[0]).toContain('█▄▀ █▀█ █▀█ █▀▄▀█ ▄▀█');
    expect(intro).toHaveBeenCalledWith('Installs KROMA on the TVs on this network');
    expect(vi.mocked(note).mock.calls[0]?.[1]).toBe('How it works');
    expect(vi.mocked(note).mock.calls[0]?.[0]).toContain('kroma-tv update');
  });
});
