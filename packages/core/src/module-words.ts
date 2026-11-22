interface Words {
  name?: string | null;
  description?: string | null;
  tagline?: string | null;
}

interface Worded extends Words {
  name: string;
  translations?: Readonly<Record<string, Words>> | null;
}

/** What a module says about itself, in one language. */
export interface ModuleWording {
  name: string;
  description: string;
  tagline: string | null;
}

function spokenIn(module: Worded, locale: string): Words {
  const own = module.translations ?? {};
  const language = locale.split('-')[0] ?? locale;
  return own[locale] ?? own[language] ?? {};
}

/** A module's own words in `locale`: the language asked for, else the language
 *  it belongs to (`fr` for `fr-CH`), else the English the manifest is written
 *  in, word by word. */
export function moduleWords(module: Worded, locale: string): ModuleWording {
  const spoken = spokenIn(module, locale);
  return {
    name: spoken.name ?? module.name,
    description: spoken.description ?? module.description ?? '',
    tagline: spoken.tagline ?? module.tagline ?? null,
  };
}
