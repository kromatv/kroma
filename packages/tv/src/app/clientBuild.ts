// Vite replaces these constants. Metro resolves this module to the native
// shell's immutable Expo build adapter instead.
import { type BuildInfo, clientBuildFor, resolveBuildInfo } from './buildMetadata';

declare const __KROMA_VERSION__: string | undefined;
declare const __KROMA_BUILD__: BuildInfo | undefined;
const info = resolveBuildInfo(
  typeof __KROMA_BUILD__ === 'object' && __KROMA_BUILD__
    ? __KROMA_BUILD__
    : {
        version:
          typeof __KROMA_VERSION__ === 'string' && __KROMA_VERSION__ ? __KROMA_VERSION__ : 'dev',
      },
);
export function buildInfo(): Readonly<BuildInfo> {
  return info;
}
export const CLIENT_BUILD = clientBuildFor(info);
