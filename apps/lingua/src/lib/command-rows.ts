import type { LinguaCommand } from '#site/lib/command-registry';
import { counted } from '#site/lib/counted';
import type { IndexedProject, MessageHit } from '#site/lib/views';

/** A page of Lingua the command menu can open, with the message to focus on a section's page. */
export type Destination =
  | { to: 'project'; project: string }
  | { to: 'language'; project: string; locale: string }
  | { to: 'section'; project: string; locale: string; file: string; key?: string };

/** The command menu's headings, in the order they are listed with nothing typed. */
export const GROUPS = {
  page: 'This page',
  messages: 'Messages',
  goTo: 'Go to',
  actions: 'Actions',
} as const;

/** A row for every project and every language in it. */
export function indexCommands(
  index: readonly IndexedProject[],
  open: (destination: Destination) => void,
): LinguaCommand[] {
  return index.flatMap(({ id, languages }) => [
    {
      id: `project:${id}`,
      label: id,
      group: GROUPS.goTo,
      icon: 'folder' as const,
      subtitle: `Project · ${counted(languages.length, 'language')}`,
      run: () => open({ to: 'project', project: id }),
    },
    ...languages.map((language) => ({
      id: `language:${id}:${language.tag}`,
      label: language.name,
      group: GROUPS.goTo,
      icon: 'language' as const,
      subtitle: `${language.nativeName} · ${language.tag}`,
      meta: id,
      keywords: `${language.tag} ${language.nativeName}`,
      run: () => open({ to: 'language', project: id, locale: language.tag }),
    })),
  ]);
}

/** A row for every section of a language. */
export function sectionCommands(
  at: { project: string; locale: string; language: string },
  files: readonly string[],
  open: (destination: Destination) => void,
): LinguaCommand[] {
  return files.map((file) => ({
    id: `section:${at.project}:${at.locale}:${file}`,
    label: file,
    group: GROUPS.goTo,
    icon: 'file-text' as const,
    subtitle: `Section · ${at.language}`,
    run: () => open({ to: 'section', project: at.project, locale: at.locale, file }),
  }));
}

/** A row for every message a search found, which opens its section on it. */
export function messageCommands(
  at: { project: string; locale: string },
  hits: readonly MessageHit[],
  open: (destination: Destination) => void,
): LinguaCommand[] {
  return hits.map((hit) => ({
    id: `message:${at.project}:${at.locale}:${hit.key}`,
    label: hit.source,
    group: GROUPS.messages,
    icon: 'message' as const,
    subtitle: hit.key,
    meta: hit.text ?? 'Not translated',
    always: true,
    run: () => open({ to: 'section', ...at, file: hit.file, key: hit.key }),
  }));
}
