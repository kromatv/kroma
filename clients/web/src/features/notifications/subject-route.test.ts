import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NotificationSubject } from '@kromatv/client/notifications';
import { describe, expect, it } from 'vitest';
import { SUBJECT_ROUTES, subjectRoute } from '#web/features/notifications/subject-route';

const TREE = fileURLToPath(new URL('../../routeTree.gen.ts', import.meta.url));

const ROUTES = [...readFileSync(TREE, 'utf8').matchAll(/fullPath: '([^']+)'/g)].map(
  ([, path]) => path as string,
);

const isCatchAllSegment = (part: string) => part === '$';
const isParamSegment = (part: string) => part.startsWith('$') && !isCatchAllSegment(part);

function isRouted(path: string): boolean {
  const asked = path.split('/');
  return ROUTES.some((template) => {
    const parts = template.replace(/\/$/, '').split('/');
    return (
      parts.length === asked.length &&
      !parts.some(isCatchAllSegment) &&
      parts.every((part, i) => isParamSegment(part) || part === asked[i])
    );
  });
}

const about = (kind: string, id = 'abc'): NotificationSubject => ({ kind, id });

describe('subjectRoute', () => {
  it('sends a moderator to the request they have to decide', () => {
    expect(subjectRoute(about('request', 'req-7'), 'request.submitted')).toBe(
      '/admin/requests/req-7',
    );
  });

  it("leaves a requester's row to the link the server resolved the title into", () => {
    expect(subjectRoute(about('request', 'req-7'), 'request.available')).toBeUndefined();
  });

  it('opens an episode on the item page, like any other title', () => {
    expect(subjectRoute(about('episode', 'ep1'), 'media.episode')).toBe('/movies/ep1');
    expect(subjectRoute(about('show', 'shw'), 'media.episode')).toBe('/shows/shw');
    expect(subjectRoute(about('movie', 'm1'), 'media.added')).toBe('/movies/m1');
  });

  it('has no screen for a kind only a module knows', () => {
    expect(subjectRoute(about('tv.kroma.torrents/torrent'), 'custom')).toBeUndefined();
  });

  it('only ever names a route the router actually has', () => {
    const named = [
      subjectRoute(about('request', 'req-7'), 'request.submitted'),
      ...Object.keys(SUBJECT_ROUTES).map((kind) => subjectRoute(about(kind), 'custom')),
    ].filter((route): route is string => route !== undefined);

    expect(named.filter((route) => !isRouted(route))).toEqual([]);
  });

  it('reads the route tree it checks against', () => {
    expect(ROUTES).toContain('/admin/requests/$id');
  });
});
