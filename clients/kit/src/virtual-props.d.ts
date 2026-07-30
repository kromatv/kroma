// `virtual:kroma-props` has no file on disk - it is served by the `propDocs`
// plugin (clients/tv-build/props-docs.ts) - so its shape is declared here.

declare module 'virtual:kroma-props' {
  import type { PropDoc } from '@kroma/workbench';

  export const PROPS: Record<string, readonly PropDoc[]>;
}
