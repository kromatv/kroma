import { canQuitApp, quitApp } from '#tv/app/appQuit';
import type { SettingsPane } from './panes';

/** About and, where the platform lets an app close itself, Quit. */
export function appPanes(openAbout: () => void): SettingsPane[] {
  return [
    {
      kind: 'action',
      id: 'about',
      icon: 'info-circle',
      label: 'about.title',
      description: 'settings.aboutDesc',
      run: openAbout,
    },
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
}
