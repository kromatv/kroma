declare module '*.mdx' {
  import type { PageMeta } from './page';
  import type { DocComponent } from './story';

  const MDXContent: DocComponent;
  export default MDXContent;

  // A `.page.mdx` describes itself in plain ESM, which MDX carries through as
  // named exports of the compiled module (see `page.ts`). Undefined on any
  // document that does not declare them, which is every `.docs.mdx`.
  export const id: PageMeta['id'];
  export const title: PageMeta['title'];
  export const group: PageMeta['group'];
  export const summary: PageMeta['summary'];
  export const order: PageMeta['order'];
}
