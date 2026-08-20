import type { KromaClient, Translate, User } from '@kroma/core';
import { buildTitleView, type TitleInput } from './titleView';

// A translator that echoes the key, appending var values so we can assert
// interpolated labels deterministically.
const t: Translate = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${Object.values(vars).join(',')}` : key) as unknown as Translate;

// A fake client: only the art helpers buildTitleView calls are implemented.
const client = {
  posterFor: (m: { id: string }) => `poster:${m.id}`,
  backdropFor: (m: { id: string }) => (m.id === 'nobd' ? null : `bd:${m.id}`),
  showPosterFor: (s: { id: string }) => `spos:${s.id}`,
  themeFor: (s: { id: string }) => `theme:${s.id}`,
} as unknown as KromaClient;

export const requester = { permissions: ['requests.create'] } as unknown as User;
export const viewer = { permissions: ['playback'] } as unknown as User;

export const build = (input: TitleInput, user: User | null = null) =>
  buildTitleView(client, t, user, input);
