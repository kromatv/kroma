import { deviceLocale, translate } from '@kromatv/core';
import { SmartHubPreview } from '@kromatv/react-native-tv/tizen/preview';
import type { LauncherBackend } from '@kromatv/tv';
import { smartHubSections } from './smart-hub-tiles';

const SETTLE_MS = 3000;

function createSmartHubLauncher(): LauncherBackend {
  const rows = { continueJson: '[]', channelsJson: '[]', published: false };
  const timer: { pending: ReturnType<typeof setTimeout> | null } = { pending: null };

  const publish = () => {
    timer.pending = null;
    const title = translate(deviceLocale(), 'content.continueWatching');
    const sections = smartHubSections(rows.continueJson, rows.channelsJson, title);
    if (sections.length === 0 && !rows.published) return;
    rows.published = sections.length > 0;
    const request = sections.length > 0 ? SmartHubPreview.set(sections) : SmartHubPreview.clear();
    void request.then((result) => {
      if (!result.published)
        console.log(`[KROMA] Smart Hub preview not published: ${result.reason}`);
    });
  };

  const schedule = () => {
    if (timer.pending !== null) clearTimeout(timer.pending);
    timer.pending = setTimeout(publish, SETTLE_MS);
  };

  return {
    setContinueWatching: (json) => {
      rows.continueJson = json;
      schedule();
    },
    setHomeChannel: (json) => {
      rows.channelsJson = json;
      schedule();
    },
  };
}

/** Tizen's launcher backend: the rows KROMA publishes to Android TV and tvOS go to
 *  the Smart Hub preview, the tiles Samsung's home bar shows above the app, once
 *  both rows have settled (Samsung takes one update per 10 minutes). */
export const nativeLauncher: LauncherBackend = createSmartHubLauncher();
