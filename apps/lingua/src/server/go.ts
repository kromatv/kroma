import { rowsFor } from '#site/core/rows';
import { localeFiles, shelfOf } from '#site/core/shelf';
import { baseOf, fileOf, sourceOf } from '#site/core/source';
import type { Store, User } from '#site/store/store';
import { openProject, type Workspace } from './workspace';

/** One message, as `/go/:owner/:repo/:locale/:key` names it. */
export interface MessageLink {
  owner: string;
  repo: string;
  locale: string;
  key: string;
}

const segments = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function rowPage(store: Store, link: MessageLink, workspace: Workspace): Promise<string | null> {
  const sourceLocale = workspace.policy.source;
  const files = await store.files(`${link.owner}/${link.repo}`, [sourceLocale]);
  const source = sourceOf(sourceLocale, localeFiles(shelfOf(workspace.root, files), sourceLocale));
  const base = baseOf(source, link.key);
  if (base === null) {
    return null;
  }
  const file = fileOf(source, link.key);
  const rows = rowsFor(source.files.get(file) ?? {}, link.locale);
  const row = rows.some((r) => r.key === link.key) ? link.key : base;
  return `${segments(file)}#${encodeURIComponent(row)}`;
}

/** Where a link to one message lands: its row on the page of its file, else the closest page that exists. */
export async function messagePage(store: Store, viewer: User | null, link: MessageLink): Promise<string> {
  const id = `${link.owner}/${link.repo}`;
  const opened = await openProject(store, id, viewer);
  if (!opened) {
    return '/';
  }
  const projectPage = `/${segments(id)}`;
  const { workspace } = opened;
  if (!workspace?.locales.includes(link.locale)) {
    return projectPage;
  }
  const localePage = `${projectPage}/${encodeURIComponent(link.locale)}`;
  const row = await rowPage(store, link, workspace);
  return row === null ? localePage : `${localePage}/${row}`;
}
