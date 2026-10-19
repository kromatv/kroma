import { canQuitApp, quitApp } from '#tv/app/appQuit';
import { AboutPanel } from './AboutPanel';
import type { SettingsPane } from './panes';

/** About and, where the platform lets an app close itself, Quit. */
export const appPanes: readonly SettingsPane[] = [
  { kind: 'panel', id: 'about', icon: 'info-circle', label: 'about.title', Panel: AboutPanel },
  {
    kind: 'action',
    id: 'quitApp',
    icon: 'power',
    label: 'profileMenu.quitApp',
    description: 'settings.quitAppDesc',
    available: canQuitApp,
    run: quitApp,
  },
];
