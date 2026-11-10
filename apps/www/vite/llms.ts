import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { site } from '@kromatv/site-meta';
import type { Plugin } from 'vite';
import { z } from 'zod';
import { parseContentPath } from '../src/lib/content-locale.ts';
import { DOC_SECTIONS, type DocSlug, isDocSlug } from '../src/lib/docs.ts';
import { BASE_LOCALE, LOCALES } from '../src/lib/locales.ts';
import { type AgentDocsInput, agentDocs } from './doc-markdown.ts';
import { DOCS_DIR } from './doc-links.ts';

const Messages = z.record(z.string(), z.string());

interface Guide {
  lang: string;
  slug: DocSlug;
  source: string;
}

async function readGuides(dir: string): Promise<Guide[]> {
  const guides: Guide[] = [];
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.md')) continue;
    const { name, lang } = parseContentPath(file);
    const slug = name === 'README' ? 'index' : name;
    if (isDocSlug(slug))
      guides.push({ lang, slug, source: await readFile(join(dir, file), 'utf8') });
  }
  return guides;
}

async function readInput(root: string): Promise<AgentDocsInput> {
  const sources: AgentDocsInput['sources'] = {};
  const labels: AgentDocsInput['labels'] = {};
  const guides = [
    ...(await readGuides(join(root, '../..', DOCS_DIR))),
    ...(await readGuides(join(root, 'content/docs'))),
  ];
  for (const lang of LOCALES) {
    sources[lang] = {};
    const messages = Messages.parse(
      JSON.parse(await readFile(join(root, 'messages', `${lang}.json`), 'utf8')),
    );
    labels[lang] = {
      name: site.name,
      summary: messages.site_description ?? '',
      sections: Object.fromEntries(
        DOC_SECTIONS.map(({ id }) => [id, messages[`docs_section_${id}`] ?? id]),
      ),
    };
  }
  for (const { lang, slug, source } of guides) {
    const byLang = sources[lang];
    if (byLang) byLang[slug] = source;
  }
  return { siteUrl: site.url, repoUrl: site.repo, baseLocale: BASE_LOCALE, sources, labels };
}

/**
 * Publishes the setup guides for agents: every guide as Markdown beside its
 * page (`/docs/docker.md`) and an `llms.txt` index per locale. Emitted into the
 * client build, and served from the sources in dev so a guide edit shows at
 * once.
 */
export function llmsPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: 'kroma:llms',

    configResolved(config) {
      root = config.root;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (!path.endsWith('.md') && !path.endsWith('/llms.txt')) return next();
        readInput(root)
          .then((input) => {
            const body = agentDocs(input).get(path);
            if (body === undefined) return next();
            const type = path.endsWith('.md') ? 'text/markdown' : 'text/plain';
            res.setHeader('content-type', `${type}; charset=utf-8`);
            res.setHeader('cache-control', 'no-cache');
            res.end(body);
          })
          .catch(next);
      });
    },

    async generateBundle() {
      if (this.environment?.name !== 'client') return;
      for (const [path, source] of agentDocs(await readInput(root))) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source });
      }
    },
  };
}
