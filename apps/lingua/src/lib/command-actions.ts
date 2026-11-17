import type { ThemeMode } from '@kromatv/ui/kit';
import type { IconName } from '@kromatv/ui/kit/atoms/icon';
import type { LinguaCommand } from '#site/lib/command-registry';
import { GROUPS } from '#site/lib/command-rows';
import { counted } from '#site/lib/counted';

type Run = LinguaCommand['run'];

const THEMES: readonly [ThemeMode, string, IconName][] = [
  ['system', 'Theme: system', 'device-desktop'],
  ['light', 'Theme: light', 'sun'],
  ['dark', 'Theme: dark', 'moon'],
];

type AccountActions = { contributions: Run; profile: Run; signOut: Run; signIn: Run };

function contributorCommands(login: string, act: AccountActions): LinguaCommand[] {
  const group = GROUPS.actions;
  return [
    {
      id: 'go:contributions',
      label: 'My contributions',
      group,
      icon: 'git-pull-request',
      keywords: 'pull requests edits unsent mine',
      run: act.contributions,
    },
    {
      id: 'profile',
      label: 'Your GitHub profile',
      group,
      icon: 'brand-github',
      keywords: login,
      run: act.profile,
    },
    {
      id: 'sign-out',
      label: 'Sign out',
      group,
      icon: 'logout',
      keywords: 'log out logout',
      run: act.signOut,
    },
  ];
}

/** The command menu's account rows: a visitor's way to sign in, or a contributor's pages and way out. */
export function accountCommands(
  signedIn: { login: string } | null,
  act: AccountActions,
): LinguaCommand[] {
  if (signedIn) {
    return contributorCommands(signedIn.login, act);
  }
  return [
    {
      id: 'sign-in',
      label: 'Sign in with GitHub',
      group: GROUPS.actions,
      icon: 'brand-github',
      keywords: 'log in login',
      run: act.signIn,
    },
  ];
}

/** The rows that switch to each theme but the one in force. */
export function themeCommands(
  current: ThemeMode,
  choose: (mode: ThemeMode) => void,
): LinguaCommand[] {
  return THEMES.filter(([mode]) => mode !== current).map(([mode, label, icon]) => ({
    id: `theme:${mode}`,
    label,
    group: GROUPS.actions,
    icon,
    keywords: 'appearance colour color mode',
    verb: 'Switch',
    run: () => choose(mode),
  }));
}

/** The row that opens the status page. */
export function setupCommand(open: Run): LinguaCommand {
  return {
    id: 'go:setup',
    label: 'Setup & status',
    group: GROUPS.actions,
    icon: 'activity',
    keywords: 'sync repositories sign-in oauth status',
    run: open,
  };
}

/** The row that syncs repository `project` now. */
export function syncCommand(project: string, run: Run): LinguaCommand {
  return {
    id: 'sync-now',
    label: `Sync ${project} now`,
    group: GROUPS.page,
    icon: 'refresh',
    verb: 'Sync',
    run,
  };
}

/** The row that starts a language in the project on the page. */
export function addLanguageCommand(run: Run): LinguaCommand {
  return {
    id: 'add-language',
    label: 'Add a language',
    group: GROUPS.page,
    icon: 'plus',
    keywords: 'new start translate',
    verb: 'Start',
    run,
  };
}

/** The row that sends the viewer's `drafts` in `language`, none while there are none. */
export function sendCommands(language: string, drafts: number, run: Run): LinguaCommand[] {
  if (drafts === 0) {
    return [];
  }
  return [
    {
      id: 'send',
      label: `Send ${counted(drafts, 'change')} in ${language}`,
      group: GROUPS.page,
      icon: 'send',
      keywords: 'pull request propose submit',
      verb: 'Send',
      run,
    },
  ];
}

/** The row that throws away the viewer's unsent `drafts` in `language`, none while there are none. */
export function discardCommands(language: string, drafts: number, run: Run): LinguaCommand[] {
  if (drafts === 0) {
    return [];
  }
  return [
    {
      id: 'discard',
      label: `Discard ${counted(drafts, 'change')} in ${language}`,
      group: GROUPS.page,
      icon: 'trash',
      keywords: 'delete remove cancel revert undo drop draft',
      verb: 'Discard',
      run,
    },
  ];
}
