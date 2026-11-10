import { describe, expect, it } from 'vitest';
import { agentDocs, docSummary, rewriteMarkdownLinks } from './doc-markdown';

const upper = (url: string) => url.toUpperCase();

describe('rewriteMarkdownLinks', () => {
  it('rewrites a link target and keeps its text and title', () => {
    const out = rewriteMarkdownLinks('See [Docker](docker.md) and [TV](tv.md "The TVs").', upper);

    expect(out).toBe('See [Docker](DOCKER.MD) and [TV](TV.MD "The TVs").');
  });

  it('rewrites a link definition', () => {
    expect(rewriteMarkdownLinks('[docker]: docker.md "Docker"', upper)).toBe(
      '[docker]: DOCKER.MD "Docker"',
    );
  });

  it('leaves a code block as it was written', () => {
    const source = ['```md', '[Docker](docker.md)', '```', '[TV](tv.md)'].join('\n');

    const out = rewriteMarkdownLinks(source, upper);

    expect(out).toBe(['```md', '[Docker](docker.md)', '```', '[TV](TV.MD)'].join('\n'));
  });

  it('closes a block only on a fence as long as the one that opened it', () => {
    const source = ['````md', '```', '[Docker](docker.md)', '````', '[TV](tv.md)'].join('\n');

    const out = rewriteMarkdownLinks(source, upper);

    expect(out).toContain('[Docker](docker.md)');
    expect(out).toContain('[TV](TV.MD)');
  });

  it('leaves a code span as it was written', () => {
    expect(rewriteMarkdownLinks('Write `[Docker](docker.md)`, see [TV](tv.md).', upper)).toBe(
      'Write `[Docker](docker.md)`, see [TV](TV.MD).',
    );
  });
});

describe('docSummary', () => {
  it('reads the title and the first paragraph as plain text', () => {
    const source = [
      '# Install KROMA with `Docker`',
      '',
      'This guide runs the **server** on',
      'port `4040`. See [Synology](synology.md).',
      '',
      'A second paragraph.',
    ].join('\n');

    expect(docSummary(source)).toEqual({
      title: 'Install KROMA with Docker',
      description: 'This guide runs the server on port 4040. See Synology.',
    });
  });

  it('skips what is not a paragraph', () => {
    const source = ['# Title', '', '> [!NOTE]', '> A note.', '', '- a list', '', 'The lead.'];

    expect(docSummary(source.join('\n')).description).toBe('The lead.');
  });

  it('gives an empty summary to a guide with no prose', () => {
    expect(docSummary('## Only a heading')).toEqual({ title: '', description: '' });
  });
});

describe('agentDocs', () => {
  const files = agentDocs({
    siteUrl: 'https://kroma.tv',
    repoUrl: 'https://github.com/kromatv/kroma',
    baseLocale: 'en',
    sources: {
      en: {
        index: '# Set up KROMA\n\nStart with [Docker](docker.md).',
        docker:
          '# Install KROMA with Docker\n\nThe server, in a container.\n\nThen [TVs](tv.md#pair), [the index](README.md), [the updater](../../server/updater/README.md), [Docker](https://docs.docker.com/) and [below](#check).',
        tv: '# Install KROMA on a TV\n\nEvery television.',
      },
      fr: {
        docker: '# Installer KROMA avec Docker\n\nLe serveur.\n\nPuis [Téléviseurs](tv.md).',
        tv: '# Installer KROMA sur un téléviseur\n\nChaque téléviseur.',
      },
    },
    labels: {
      en: { name: 'KROMA', summary: 'A media server.', sections: { server: 'Install the server' } },
      fr: { name: 'KROMA', summary: 'Un serveur.', sections: { start: 'Bien démarrer' } },
    },
  });

  it('publishes every guide beside its page, under its locale', () => {
    expect([...files.keys()].sort()).toEqual([
      '/docs.md',
      '/docs/docker.md',
      '/docs/tv.md',
      '/fr/docs/docker.md',
      '/fr/docs/tv.md',
      '/fr/llms.txt',
      '/llms.txt',
    ]);
  });

  it('points a link between guides at the Markdown of the other guide', () => {
    const docker = files.get('/docs/docker.md');

    expect(docker).toContain('[TVs](https://kroma.tv/docs/tv.md#pair)');
    expect(docker).toContain('[the index](https://kroma.tv/docs.md)');
    expect(docker).toContain(
      '[the updater](https://github.com/kromatv/kroma/blob/main/server/updater/README.md)',
    );
    expect(docker).toContain('[Docker](https://docs.docker.com/)');
    expect(docker).toContain('[below](#check)');
  });

  it('keeps a translated guide in its language', () => {
    expect(files.get('/fr/docs/docker.md')).toContain(
      '[Téléviseurs](https://kroma.tv/fr/docs/tv.md)',
    );
  });

  it('indexes the guides by section, in reading order', () => {
    expect(files.get('/llms.txt')).toBe(
      [
        '# KROMA',
        '',
        '> A media server.',
        '',
        '## start',
        '',
        '- [Set up KROMA](https://kroma.tv/docs.md): Start with Docker.',
        '',
        '## Install the server',
        '',
        '- [Install KROMA with Docker](https://kroma.tv/docs/docker.md): The server, in a container.',
        '',
        '## apps',
        '',
        '- [Install KROMA on a TV](https://kroma.tv/docs/tv.md): Every television.',
        '',
      ].join('\n'),
    );
  });

  it('lists an untranslated guide in the base language', () => {
    const index = files.get('/fr/llms.txt');

    expect(index).toContain('## Bien démarrer\n\n- [Set up KROMA](https://kroma.tv/docs.md)');
    expect(index).toContain('- [Installer KROMA avec Docker](https://kroma.tv/fr/docs/docker.md)');
  });

  it('leaves a link to a page that is not a guide on the site', () => {
    const out = agentDocs({
      siteUrl: 'https://kroma.tv',
      repoUrl: 'https://github.com/kromatv/kroma',
      baseLocale: 'en',
      sources: { en: { docker: '# Docker\n\nSee [later](/docs/later#soon).' } },
      labels: {},
    });

    expect(out.get('/docs/docker.md')).toContain('[later](https://kroma.tv/docs/later#soon)');
  });
});
