import { createBlog, type MdxModule } from '#site/lib/blog';

// Every `.mdx` under content/blog, resolved eagerly at build time. Kept out
// of lib/blog: `import.meta.glob({ eager: true })` is a bundler feature, so a
// module holding one cannot be loaded without the MDX pipeline attached,
// which would put lib/blog's rules behind a build step to test.
export const { getAllPosts, getPost } = createBlog(
  import.meta.glob<MdxModule>('../../content/blog/*.mdx', { eager: true }),
);
