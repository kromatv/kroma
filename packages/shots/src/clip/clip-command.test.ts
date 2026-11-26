import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signOut, speak } from './account';
import { clipCommand } from './clip-command';
import type { Sweep } from './screen-read';
import { sweep } from './sweep';

vi.mock('./account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account')>()),
  signInAccount: vi.fn((server: string) =>
    Promise.resolve({
      server,
      accessToken: 'a',
      token: 't',
      user: { language: 'fr' },
      signedInHere: true,
    }),
  ),
  speak: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./sweep', () => ({ sweep: vi.fn() }));

vi.mock('./tv-screens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tv-screens')>()),
  librarySamples: vi.fn(() => Promise.resolve({ movie: undefined, show: undefined })),
}));

const REPO = new URL('../../../..', import.meta.url).pathname;
const ENV = { KROMA_EMAIL: 'owner', KROMA_PASSWORD: 'secret' };
const CUT = { width: 8, height: 0 };

const FOUND: Sweep = {
  clips: [
    { language: 'en', target: 'web', screen: '/about', text: 'Copy versions', clipped: CUT },
    { language: 'en', target: 'web', screen: '/movies', text: 'A Very Long Title', clipped: CUT },
  ],
  unread: [],
};

let printed: string[] = [];

beforeEach(() => {
  printed = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    printed.push(line);
  });
});

afterEach(() => {
  vi.mocked(sweep).mockReset();
});

describe('bun run shots:clip', () => {
  it('lists each clipped text with the key it reads, and fails', async () => {
    vi.mocked(sweep).mockResolvedValue(FOUND);

    const code = await clipCommand(REPO, ['--langs', 'en'], ENV);

    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('"Copy versions" (en:about.copyVersions)');
    expect(printed.join('\n')).toContain('"A Very Long Title"');
  });

  it('puts the account language back and signs out, even when the sweep fails', async () => {
    vi.mocked(sweep).mockRejectedValue(new Error('nothing answered'));

    await expect(clipCommand(REPO, ['--langs', 'en'], ENV)).rejects.toThrow('nothing answered');

    expect(vi.mocked(speak).mock.calls.at(-1)?.[1]).toBe('fr');
    expect(signOut).toHaveBeenCalled();
  });

  it('keeps to the texts of the catalogs with --catalog-only', async () => {
    vi.mocked(sweep).mockResolvedValue({ clips: FOUND.clips.slice(1), unread: [] });

    const code = await clipCommand(REPO, ['--langs', 'en', '--catalog-only'], ENV);

    expect(code).toBe(0);
    expect(printed.join('\n')).not.toContain('A Very Long Title');
  });

  it('passes with --report, and prints JSON with --json', async () => {
    vi.mocked(sweep).mockResolvedValue(FOUND);

    const code = await clipCommand(REPO, ['--langs', 'en', '--report', '--json'], ENV);

    expect(code).toBe(0);
    expect(JSON.parse(printed.join('\n')).findings).toHaveLength(2);
  });

  it('sweeps every language the product offers, its source first', async () => {
    vi.mocked(sweep).mockResolvedValue({ clips: [], unread: [] });

    const code = await clipCommand(REPO, [], ENV);

    expect(code).toBe(0);
    expect(vi.mocked(sweep).mock.calls[0]?.[0].languages.slice(0, 2)).toEqual(['en', 'fr']);
  });
});
