import type { usePlayerNav } from './hooks/use-player-nav';
import type { UpNextData } from './parts/up-next-sheet';

function initialSettingsView(overlay: string | null): 'audio' | 'subtitles' | 'menu' {
  if (overlay === 'audio') return 'audio';
  if (overlay === 'subtitles') return 'subtitles';
  return 'menu';
}

function hasUpNext(data: UpNextData): boolean {
  return data.nextEpisodes.length + data.recommendations.length > 0;
}

function deriveChrome(
  nav: ReturnType<typeof usePlayerNav>,
  upNext: UpNextData,
  panelCovers: boolean,
  over = false,
) {
  const settingsOpen =
    nav.overlay === 'settings' || nav.overlay === 'audio' || nav.overlay === 'subtitles';
  const sheetOpen = nav.overlay === 'sheet';
  // Whether the picture is on the card, not HOW it got there: which hold the
  // card takes is the surface's business (see lib/surface-shrink).
  const settingsShrink = settingsOpen && !panelCovers;
  const peekVisible = !over && nav.revealed && hasUpNext(upNext) && !settingsShrink && !nav.overlay;
  const chromeShown = !over && nav.revealed && !nav.overlay;
  return { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown };
}

export { deriveChrome, hasUpNext, initialSettingsView };
