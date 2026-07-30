import { createBlog, type MdxModule } from '#site/lib/blog';

// The site's actual blog: every `.mdx` under content/blog, resolved eagerly at build
// time so every post is available to the prerender with no runtime fetch. Drop a file
// in and it appears - no route to add, no index to update.
//
// This module exists to keep that glob out of lib/blog. `import.meta.glob` is a
// BUNDLER feature and `eager` makes it run on import, so a module holding one cannot be
// loaded without the MDX pipeline attached - which would put the loader's rules (the
// translation fallback, the inherited frontmatter, the ordering, the draft rule) behind
// a build step to test. Discovery lives here; the decisions live there.
export const { getAllPosts, getPost } = createBlog(
  import.meta.glob<MdxModule>('../../content/blog/*.mdx', { eager: true }),
);
