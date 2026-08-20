import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

/** The catalog/session surface the `useWebSubtitles` suites stub out. */
export const H = {
  genLangs: [] as { code: string; label: string }[],
  generations: [] as { id: string; status: string }[],
  user: null as { subtitleLanguage?: string | null } | null,
  downloadedSubtitles: vi.fn(),
  subtitleCapabilities: vi.fn(),
  deleteSubtitle: vi.fn(),
  generateSubtitle: vi.fn(),
  resolveArt: vi.fn((u: string): string | null => u),
  cancel: vi.fn(),
  refresh: vi.fn(),
  lastGenOpts: null as { onComplete: (subId: string) => void } | null,
  updateUser: vi.fn(),
  updateAccount: vi.fn(async () => ({})),
};

export function movie(subs: MovieView['subs']): MovieView {
  return { id: 'movie-1', subs } as MovieView;
}

export async function settle() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

/** Registers the per-test reset every `useWebSubtitles` suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    vi.resetAllMocks();
    H.user = null;
    H.genLangs = [
      { code: 'fr', label: 'Français' },
      { code: 'en', label: 'English' },
    ];
    H.generations = [];
    H.resolveArt.mockImplementation((u: string) => u);
    H.downloadedSubtitles.mockResolvedValue([]);
    H.subtitleCapabilities.mockResolvedValue(null);
    H.deleteSubtitle.mockResolvedValue(undefined);
    H.generateSubtitle.mockResolvedValue(undefined);
    H.updateAccount.mockResolvedValue({});
  });
  afterEach(() => cleanup());
}
