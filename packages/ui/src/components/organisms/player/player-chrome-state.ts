import type { usePlayerNav } from './hooks/use-player-nav';
import type { UpNextData } from './parts/up-next-sheet';

function initialSettingsView(overlay: string | null): 'audio' | 'subtitles' | 'menu' {
  if (overlay === 'audio') return 'audio';
  if (overlay === 'subtitles') return 'subtitles';
  return 'menu';
}

function deriveChrome(
  nav: ReturnType<typeof usePlayerNav>,
  upNext: UpNextData,
  panelCovers: boolean,
) {
  const settingsOpen =
    nav.overlay === 'settings' || nav.overlay === 'audio' || nav.overlay === 'subtitles';
  const sheetOpen = nav.overlay === 'sheet';
  // Whether the picture is on the card, not HOW it got there: which hold the
  // card takes is the surface's business (see lib/surface-shrink).
  const settingsShrink = settingsOpen && !panelCovers;
  const hasUpNext = upNext.nextEpisodes.length + upNext.recommendations.length > 0;
  const peekVisible = nav.revealed && hasUpNext && !settingsShrink && !nav.overlay;
  const chromeShown = nav.revealed && !nav.overlay;
  return { settingsOpen, sheetOpen, settingsShrink, peekVisible, chromeShown };
}

export { deriveChrome, initialSettingsView };
