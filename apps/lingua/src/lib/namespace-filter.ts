import type { NamespaceSummary } from '#site/lib/views';

/** Which catalog files a language page lists. */
export type NamespaceFilter = 'all' | 'incomplete' | 'outdated' | 'unreviewed' | 'mine';

/** Whether `namespace` belongs in the list under `filter`. */
export function matchesNamespace(namespace: NamespaceSummary, filter: NamespaceFilter): boolean {
  switch (filter) {
    case 'incomplete':
      return namespace.states.missing > 0;
    case 'outdated':
      return namespace.states.outdated > 0;
    case 'unreviewed':
      return namespace.states.unreviewed > 0;
    case 'mine':
      return namespace.drafts > 0;
    default:
      return true;
  }
}

/** How many catalog files each filter lists. */
export function namespaceCounts(
  namespaces: readonly NamespaceSummary[],
): Record<NamespaceFilter, number> {
  const count = (filter: NamespaceFilter) =>
    namespaces.filter((namespace) => matchesNamespace(namespace, filter)).length;
  return {
    all: namespaces.length,
    incomplete: count('incomplete'),
    outdated: count('outdated'),
    unreviewed: count('unreviewed'),
    mine: count('mine'),
  };
}

/** How many messages of `namespace` ask for a translator: missing, outdated or unreviewed. */
export function workLeft({ states }: Pick<NamespaceSummary, 'states'>): number {
  return states.missing + states.outdated + states.unreviewed;
}

/** The first catalog file with work left, where "Continue" leads. */
export function nextNamespace(namespaces: readonly NamespaceSummary[]): NamespaceSummary | null {
  return namespaces.find((namespace) => workLeft(namespace) > 0) ?? null;
}
