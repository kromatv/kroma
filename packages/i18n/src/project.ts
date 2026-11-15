/**
 * How far a language has come. A `draft` is in the repository and nowhere
 * else: it is typed, it loads in dev, and no reader is offered it. A `beta` is
 * offered, and what it has not translated yet reads in its fallback. A
 * `stable` one is held complete, so it never falls back.
 */
export type Stage = (typeof STAGES)[number];

export const STAGES = ['draft', 'beta', 'stable'] as const;

export interface LocalePolicy {
  /** `draft` when left out, and for a folder the project does not name. */
  readonly stage?: string;
  /** The language this one reads in where it has no translation, ahead of the
   *  project's own fallback. A regional locale already falls back to its
   *  language, `pt-BR` to `pt`, without saying so. */
  readonly fallback?: string;
}

/**
 * The policy file beside the locale folders, `i18n.json`. It decides nothing a
 * folder already says: which languages exist is the folders, and what they say
 * is the files. It holds what a folder cannot.
 */
export interface Project {
  /** The language the messages are written in. Its files are the complete
   *  set, they type the keys, and every chain ends in it. */
  readonly source: string;
  /** What an unfinished translation reads in before the source language. */
  readonly fallback?: string;
  readonly locales?: Readonly<Record<string, LocalePolicy>>;
}

function isStage(value: string | undefined): value is Stage {
  return STAGES.includes(value as Stage);
}

export function stageOf(project: Project, locale: string): Stage {
  if (locale === project.source) {
    return 'stable';
  }
  const stage = project.locales?.[locale]?.stage;
  return isStage(stage) ? stage : 'draft';
}

/** Whether a reader can be offered `locale`: anything past `draft`. */
export function isOffered(project: Project, locale: string): boolean {
  return stageOf(project, locale) !== 'draft';
}

/** `pt-BR` gives `pt`; `zh-Hant-TW` gives `zh-Hant`, then `zh`. */
export function parentTags(tag: string): string[] {
  const parents: string[] = [];
  let rest = tag;
  for (let cut = rest.lastIndexOf('-'); cut > 0; cut = rest.lastIndexOf('-')) {
    rest = rest.slice(0, cut);
    parents.push(rest);
  }
  return parents;
}

/**
 * The locales a message is looked up in when `locale` renders, in order and
 * starting with itself: its own fallback where the project names one, else the
 * languages its tag is a region of, then the project's fallback, then the
 * source. Only locales that exist are named, and each of them once.
 */
export function fallbackChain(
  project: Project,
  locale: string,
  exists: (locale: string) => boolean,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  const push = (code: string | undefined) => {
    if (code !== undefined && exists(code) && !chain.includes(code)) {
      chain.push(code);
    }
  };
  const visit = (code: string) => {
    if (visited.has(code)) {
      return;
    }
    visited.add(code);
    push(code);
    const named = project.locales?.[code]?.fallback;
    if (named === undefined) {
      for (const parent of parentTags(code)) {
        push(parent);
      }
    } else {
      visit(named);
    }
  };
  visit(locale);
  if (project.fallback !== undefined) {
    visit(project.fallback);
  }
  push(project.source);
  if (!chain.includes(locale)) {
    chain.unshift(locale);
  }
  return chain;
}
