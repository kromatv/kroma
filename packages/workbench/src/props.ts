// Populated at build time by `propDocs` in clients/tv-build; Metro has no
// equivalent and shows no prop docs.

export interface PropDoc {
  name: string;
  /** The type as written - `IconName`, not the union it aliases. */
  type: string;
  optional: boolean;
  docs?: string;
}

/** One part of a compound component, or the whole of a plain one - whose `part`
 * is absent, because it has no name to give. */
export interface PropSection {
  part?: string;
  props: readonly PropDoc[];
}

/** Every documented component, keyed `Button` for a plain one and `Dialog.Root`
 * for one part of a compound one. */
export type PropDocs = Record<string, readonly PropDoc[]>;

/**
 * What the Props tab shows for the story called `name`: a section per part of a
 * compound component, in the order the map's keys carry, or the single unnamed
 * section of a plain one. A component with parts is documented by them alone.
 *
 * No name is ever split, so `ListRowProps` documents a <ListRow> and never the
 * Root of a <List>: a key is a part only when it was written as one.
 */
export function propSections(name: string, docs: PropDocs): PropSection[] {
  const prefix = `${name}.`;
  const parts: PropSection[] = [];
  for (const [key, props] of Object.entries(docs)) {
    if (key.startsWith(prefix) && props.length > 0) {
      parts.push({ part: key.slice(prefix.length), props });
    }
  }
  if (parts.length > 0) return parts;
  const own = docs[name];
  return own?.length ? [{ props: own }] : [];
}

/** Every prop the sections hold, which is what the panel's tab counts. */
export function propCount(sections: readonly PropSection[]): number {
  return sections.reduce((total, section) => total + section.props.length, 0);
}
