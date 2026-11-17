import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { findMessages, getProjectIndex } from '#site/lib/loaders';
import type { IndexedProject, MessageHit } from '#site/lib/views';

const SEARCH_DELAY_MS = 200;

/** Every project and its languages, fetched once the command menu opens; empty until they arrive or if they cannot. */
export function useProjectIndex(): IndexedProject[] {
  const [index, setIndex] = useState<IndexedProject[]>([]);
  useEffect(() => {
    let live = true;
    getProjectIndex()
      .then((found) => live && setIndex(found))
      .catch(() => live && setIndex([]));
    return () => {
      live = false;
    };
  }, []);
  return index;
}

/** The language the page behind the command menu is in, whose messages it searches; null outside one. */
export function useMessageScope(): { project: string; locale: string } | null {
  const { owner, repo, locale } = useParams({ strict: false });
  return owner && repo && locale ? { project: `${owner}/${repo}`, locale } : null;
}

/** The messages of `scope` that mention `query`, searched a moment after typing stops. */
export function useMessageHits(
  scope: { project: string; locale: string } | null,
  query: string,
): MessageHit[] {
  const [hits, setHits] = useState<MessageHit[]>([]);
  const project = scope?.project;
  const locale = scope?.locale;
  const searching = project !== undefined && locale !== undefined && query.trim().length >= 2;
  useEffect(() => {
    if (!project || !locale || !searching) {
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      findMessages({ data: { id: project, locale, query } })
        .then((found) => live && setHits(found))
        .catch(() => live && setHits([]));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, locale, query, searching]);
  return searching ? hits : [];
}
