import { describe, expect, it } from 'vitest';
import { createBlog, type MdxModule } from './blog';

// `createBlog` takes the module map, so these drive the resolver directly instead of
// going through the MDX pipeline: what is worth testing is what the loader DECIDES -
// which language a reader gets, what a translation inherits, the ordering, the draft
// rule - and none of that needs a real .mdx to compile.

const Body = (() => null) as unknown as MdxModule['default'];

const mod = (frontmatter: MdxModule['frontmatter'], readingMinutes?: number): MdxModule => ({
  default: Body,
  frontmatter,
  readingMinutes,
});

const dir = '../../content/blog';

describe('createBlog', () => {
  it('keys a post by slug across languages', () => {
    const blog = createBlog({
      [`${dir}/one.mdx`]: mod({ title: 'One', date: '2026-01-01' }),
      [`${dir}/one.fr.mdx`]: mod({ title: 'Un' }),
    });

    expect(blog.getAllPosts('en').map((p) => p.slug)).toEqual(['one']);
    expect(blog.getPost('one', 'en')?.title).toBe('One');
    expect(blog.getPost('one', 'fr')?.title).toBe('Un');
  });

  // The point of the fallback: a reader is never shown a missing page for a post
  // nobody has translated yet.
  it('falls back to the default language, and says it did', () => {
    const blog = createBlog({ [`${dir}/only-en.mdx`]: mod({ title: 'Only', date: '2026-01-01' }) });

    const fr = blog.getPost('only-en', 'fr');
    expect(fr?.title).toBe('Only');
    expect(fr?.translated).toBe(false);
    expect(blog.getPost('only-en', 'en')?.translated).toBe(true);
  });

  // So a `.fr.mdx` can carry only the fields that actually changed.
  it('inherits missing frontmatter from the default-language file', () => {
    const blog = createBlog({
      [`${dir}/p.mdx`]: mod({ title: 'T', date: '2026-03-04', author: 'Max', tags: ['a'] }),
      [`${dir}/p.fr.mdx`]: mod({ title: 'Titre' }),
    });

    const fr = blog.getPost('p', 'fr');
    expect(fr?.title).toBe('Titre');
    expect(fr?.date).toBe('2026-03-04');
    expect(fr?.author).toBe('Max');
    expect(fr?.tags).toEqual(['a']);
  });

  it('sorts newest first', () => {
    const blog = createBlog({
      [`${dir}/old.mdx`]: mod({ date: '2024-01-01' }),
      [`${dir}/new.mdx`]: mod({ date: '2026-06-01' }),
      [`${dir}/mid.mdx`]: mod({ date: '2025-01-01' }),
    });

    expect(blog.getAllPosts('en').map((p) => p.slug)).toEqual(['new', 'mid', 'old']);
  });

  it('fills the defaults a card needs when frontmatter is bare', () => {
    const blog = createBlog({ [`${dir}/bare.mdx`]: mod({}) });

    const post = blog.getPost('bare', 'en');
    expect(post?.title).toBe('bare');
    expect(post?.author).toBe('KROMA');
    expect(post?.excerpt).toBe('');
    expect(post?.tags).toEqual([]);
    expect(post?.readingMinutes).toBe(1);
    expect(post?.dateLabel).not.toBe('');
  });

  it('reads the reading estimate the remark plugin injected', () => {
    const blog = createBlog({ [`${dir}/p.mdx`]: mod({ date: '2026-01-01' }, 7) });
    expect(blog.getPost('p', 'en')?.readingMinutes).toBe(7);
  });

  it('labels the date in the reader language', () => {
    const modules = { [`${dir}/p.mdx`]: mod({ date: '2026-07-30' }) };
    const blog = createBlog(modules);
    expect(blog.getPost('p', 'en')?.dateLabel).toBe('July 30, 2026');
    expect(blog.getPost('p', 'fr')?.dateLabel).toBe('30 juillet 2026');
  });

  it('hides a draft in a production build but shows it in dev', () => {
    const modules = { [`${dir}/wip.mdx`]: mod({ title: 'WIP', draft: true }) };

    expect(createBlog(modules, false).getAllPosts('en')).toEqual([]);
    expect(createBlog(modules, true).getAllPosts('en')).toHaveLength(1);
  });

  it('is undefined for a slug that does not exist', () => {
    expect(createBlog({}).getPost('nope', 'en')).toBeUndefined();
  });
});
