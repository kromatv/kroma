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

const Messages = z.object({ site_description: z.string() }).catchall(z.string());

interface Guide {
  lang: string;
  slug: DocSlug;
  source: string;
}

async function readGuides(dir: string): Promise<Guide[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md'));
  const guides = await Promise.all(
    files.map(async (file): Promise<Guide | undefined> => {
      const { name, lang } = parseContentPath(file);
      const slug = name === 'README' ? 'index' : name;
      if (!isDocSlug(slug)) return undefined;
      return { lang, slug, source: await readFile(join(dir, file), 'utf8') };
    }),
  );
  return guides.filter((guide) => guide !== undefined);
}

async function readLabels(root: string, lang: string): Promise<AgentDocsInput['labels'][string]> {
  const file = await readFile(join(root, 'messages', `${lang}.json`), 'utf8');
  const messages = Messages.parse(JSON.parse(file));
  return {
    name: site.name,
    summary: messages.site_description,
    sections: Object.fromEntries(
      DOC_SECTIONS.map(({ id }) => [id, messages[`docs_section_${id}`] ?? id]),
    ),
  };
}

async function readInput(root: string): Promise<AgentDocsInput> {
  const [english, translated, labelled] = await Promise.all([
    readGuides(join(root, '../..', DOCS_DIR)),
    readGuides(join(root, 'content/docs')),
    Promise.all(LOCALES.map(async (lang) => [lang, await readLabels(root, lang)] as const)),
  ]);
  const guides = [...english, ...translated];
  const sources = Object.fromEntries(
    LOCALES.map((lang) => [
      lang,
      Object.fromEntries(
        guides.filter((guide) => guide.lang === lang).map(({ slug, source }) => [slug, source]),
      ),
    ]),
  );
  const labels = Object.fromEntries(labelled);
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
