import { describe, expect, it } from 'vitest';
import { isDocFile, remarkDocLinks, rewriteDocUrl } from './doc-links';

const repo = 'https://github.com/kromatv/kroma';

interface TestNode {
  type: string;
  url?: string;
  children?: TestNode[];
}

describe('rewriteDocUrl', () => {
  it('turns a link to another guide into its page', () => {
    expect(rewriteDocUrl('docker.md', repo)).toBe('/docs/docker');
    expect(rewriteDocUrl('./media-folders.md#name-your-files', repo)).toBe(
      '/docs/media-folders#name-your-files',
    );
  });

  it('turns the README of the guides into the index', () => {
    expect(rewriteDocUrl('README.md', repo)).toBe('/docs');
    expect(rewriteDocUrl('../setup/', repo)).toBe('/docs');
    expect(rewriteDocUrl('README.md#install-the-apps', repo)).toBe('/docs#install-the-apps');
  });

  it('sends any other path of the repository to GitHub', () => {
    expect(rewriteDocUrl('../../server/updater/README.md#docker', repo)).toBe(
      `${repo}/blob/main/server/updater/README.md#docker`,
    );
    expect(rewriteDocUrl('../writing-docs.md', repo)).toBe(
      `${repo}/blob/main/docs/writing-docs.md`,
    );
  });

  it('leaves absolute links, site paths and anchors alone', () => {
    expect(rewriteDocUrl('https://kroma.tv/download', repo)).toBe('https://kroma.tv/download');
    expect(rewriteDocUrl('mailto:beta@kroma.tv', repo)).toBe('mailto:beta@kroma.tv');
    expect(rewriteDocUrl('/download', repo)).toBe('/download');
    expect(rewriteDocUrl('#check-that-it-works', repo)).toBe('#check-that-it-works');
  });

  it('leaves a path that climbs out of the repository alone', () => {
    expect(rewriteDocUrl('../../../elsewhere.md', repo)).toBe('../../../elsewhere.md');
  });
});

describe('isDocFile', () => {
  it('recognizes the English guides and their translations', () => {
    expect(isDocFile('/repo/docs/setup/docker.md')).toBe(true);
    expect(isDocFile('/repo/apps/www/content/docs/docker.fr.md')).toBe(true);
    expect(isDocFile('C:\\repo\\docs\\setup\\docker.md')).toBe(true);
  });

  it('ignores every other file', () => {
    expect(isDocFile('/repo/apps/www/content/blog/post.mdx')).toBe(false);
    expect(isDocFile(undefined)).toBe(false);
  });
});

describe('remarkDocLinks', () => {
  it('rewrites links and definitions of a guide, however deep', () => {
    const tree: TestNode = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'link', url: 'docker.md' }] },
        { type: 'definition', url: '../../LICENSE' },
      ],
    };

    remarkDocLinks({ repoUrl: repo })(tree, { path: '/repo/docs/setup/README.md' });

    expect(tree.children?.[0]?.children?.[0]?.url).toBe('/docs/docker');
    expect(tree.children?.[1]?.url).toBe(`${repo}/blob/main/LICENSE`);
  });

  it('leaves a blog post as it was written', () => {
    const tree: TestNode = { type: 'root', children: [{ type: 'link', url: 'docker.md' }] };

    remarkDocLinks({ repoUrl: repo })(tree, { path: '/repo/apps/www/content/blog/post.mdx' });

    expect(tree.children?.[0]?.url).toBe('docker.md');
  });
});
