import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { run } from './sh';

/** The repository an attachment belongs to when none is named. */
export const DEFAULT_REPO = 'kromatv/kroma';

const UPLOAD_URL = 'https://uploads.github.com/user-attachments/assets';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

const Attached = z.object({ url: z.url() });

/** What an upload needs from GitHub: the numeric id of the repository the
 *  attachment belongs to, and a token with push access to it. */
export interface AttachContext {
  repositoryId: string;
  token: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** The context for `repo` ("owner/name"), from the gh CLI's own login. */
export function githubContext(repo: string): AttachContext {
  return {
    repositoryId: run('gh', ['api', `repos/${repo}`, '--jq', '.id']).trim(),
    token: run('gh', ['auth', 'token']).trim(),
  };
}

/**
 * Uploads an image or a video as a GitHub attachment, what dropping it into the
 * PR editor does, and returns its `https://github.com/user-attachments/assets/…`
 * URL. The endpoint is undocumented and takes images and video only. The URL
 * answers 404 to an anonymous request; GitHub's renderer signs it, so it shows
 * in a PR or issue body.
 */
export async function attach(file: string, context: AttachContext): Promise<string> {
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  if (!contentType) throw new Error(`${file}: GitHub attaches images and video only`);
  const query = new URLSearchParams({
    name: basename(file),
    content_type: contentType,
    repository_id: context.repositoryId,
  });
  const response = await (context.fetch ?? fetch)(`${UPLOAD_URL}?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.token}`,
      Accept: 'application/json',
      'Content-Type': contentType,
    },
    body: readFileSync(file),
  });
  if (response.status !== 201) {
    throw new Error(`${file}: GitHub answered ${response.status} ${await response.text()}`);
  }
  return Attached.parse(await response.json()).url;
}

/** The markdown that shows `url` as an image, named after its file. */
export function imageMarkdown(file: string, url: string): string {
  return `![${basename(file, extname(file))}](${url})`;
}
