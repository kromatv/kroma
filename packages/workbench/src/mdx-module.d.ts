declare module '*.mdx' {
  import type { DocComponent } from './story';

  const MDXContent: DocComponent;
  export default MDXContent;
}
