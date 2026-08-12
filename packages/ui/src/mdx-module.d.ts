// The kit's own `.page.mdx` articles, as the bundlers compile them. Mirrors the
// declaration in @kroma/workbench, which a consumer of that package gets from
// its own source and this one does not.

declare module '*.mdx' {
  import type { PageMeta } from '@kroma/workbench';
  import type { ComponentType } from 'react';

  const MDXContent: ComponentType<{ components?: Record<string, unknown> }>;
  export default MDXContent;

  export const id: PageMeta['id'];
  export const title: PageMeta['title'];
  export const group: PageMeta['group'];
  export const summary: PageMeta['summary'];
  export const order: PageMeta['order'];
}
