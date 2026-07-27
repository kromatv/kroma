import type { ConfigEnv, UserConfig } from 'vite';
import { tvShellConfig } from '../tv-build/shell';
import { target } from './tv.target';

// The shared TV-shell pipeline, parameterized by ./tv.target.ts. Modern tier
// only - see the target for why there is no legacy bundle here.
const shell = tvShellConfig(import.meta.url, target);

export default function tvWebConfig(env: ConfigEnv): UserConfig {
  return {
    ...shell(env),
    // ABSOLUTE base, unlike every packaged shell.
    //
    // The factory defaults to './' because a .wgt / .ipk is loaded from a local
    // path and must reference its assets relatively. This shell is served from an
    // origin with an SPA fallback, so a stray deep path (`/anything/here`) returns
    // index.html - and a relative `./assets/index.js` there would resolve against
    // `/anything/` and 404 the whole app. Rooting the URLs makes the fallback
    // actually recoverable. Same reason the kit's config pins an absolute base.
    base: '/',
  };
}
