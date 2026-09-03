import { fakeClient } from '@kroma/client/test';
import type { Translate, User } from '@kroma/core';
import { buildTitleView, type TitleInput } from './titleView';

// A translator that echoes the key, appending var values so we can assert
// interpolated labels deterministically.
const t: Translate = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${Object.values(vars).join(',')}` : key) as unknown as Translate;

// `backdropFor` and `themeFor` are handed the whole title but only declare the
// metadata they read, so the id they are keyed on here is read off the value.
const idOf = (x: object) => ('id' in x && typeof x.id === 'string' ? x.id : '');

const client = fakeClient({
  media: {
    artwork: {
      posterFor: (m) => `poster:${m.id}`,
      backdropFor: (m) => (idOf(m) === 'nobd' ? null : `bd:${idOf(m)}`),
      showPosterFor: (s) => `spos:${s.id}`,
      themeFor: (s) => `theme:${idOf(s)}`,
    },
  },
});

export const requester = { permissions: ['requests.create'] } as unknown as User;
export const viewer = { permissions: ['playback'] } as unknown as User;

export const build = (input: TitleInput, user: User | null = null) =>
  buildTitleView(client, t, user, input);
