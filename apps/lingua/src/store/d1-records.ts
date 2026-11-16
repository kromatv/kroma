import { z } from 'zod';
import type { Confirm, Edit, FileRow, Project, Proposal, Start, User } from './store';

const ProjectRecord = z.object({
  id: z.string(),
  installation_id: z.number(),
  branch: z.string(),
  config: z.string().nullable(),
  config_error: z.string().nullable(),
  head_sha: z.string().nullable(),
  tree_sha: z.string().nullable(),
  synced_at: z.number().nullable(),
});

const FileRecord = z.object({
  path: z.string(),
  kind: z.enum(['policy', 'notes', 'lock', 'catalog']),
  locale: z.string(),
  file: z.string(),
  blob_sha: z.string(),
  body: z.string(),
});

const UserRecord = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const EditRecord = z.object({
  project: z.string(),
  user_id: z.number(),
  locale: z.string(),
  file: z.string(),
  key: z.string(),
  value: z.string(),
  proposed: z.number(),
  updated_at: z.number(),
});

const ConfirmRecord = z.object({
  project: z.string(),
  user_id: z.number(),
  locale: z.string(),
  key: z.string(),
  proposed: z.number(),
  updated_at: z.number(),
});

const StartRecord = z.object({
  project: z.string(),
  user_id: z.number(),
  locale: z.string(),
  proposed: z.number(),
  created_at: z.number(),
});

const ProposalRecord = z.object({
  project: z.string(),
  user_id: z.number(),
  locale: z.string(),
  branch: z.string(),
  pr_number: z.number(),
  pr_url: z.string(),
  head_sha: z.string(),
  updated_at: z.number(),
});

/** A `projects` row as the store hands it out. */
export function project(row: unknown): Project {
  const r = ProjectRecord.parse(row);
  return {
    id: r.id,
    installationId: r.installation_id,
    branch: r.branch,
    config: r.config,
    configError: r.config_error,
    headSha: r.head_sha,
    treeSha: r.tree_sha,
    syncedAt: r.synced_at,
  };
}

/** A `files` row as the store hands it out. */
export function file(row: unknown): FileRow {
  const r = FileRecord.parse(row);
  return {
    path: r.path,
    kind: r.kind,
    locale: r.locale,
    file: r.file,
    blobSha: r.blob_sha,
    body: r.body,
  };
}

/** A `users` row as the store hands it out. */
export function user(row: unknown): User {
  const r = UserRecord.parse(row);
  return { id: r.id, login: r.login, name: r.name, avatarUrl: r.avatar_url };
}

/** An `edits` row as the store hands it out. */
export function edit(row: unknown): Edit {
  const r = EditRecord.parse(row);
  return {
    project: r.project,
    userId: r.user_id,
    locale: r.locale,
    file: r.file,
    key: r.key,
    value: r.value,
    proposed: r.proposed === 1,
    updatedAt: r.updated_at,
  };
}

/** A `confirms` row as the store hands it out. */
export function confirm(row: unknown): Confirm {
  const r = ConfirmRecord.parse(row);
  return {
    project: r.project,
    userId: r.user_id,
    locale: r.locale,
    key: r.key,
    proposed: r.proposed === 1,
    updatedAt: r.updated_at,
  };
}

/** A `starts` row as the store hands it out. */
export function start(row: unknown): Start {
  const r = StartRecord.parse(row);
  return {
    project: r.project,
    userId: r.user_id,
    locale: r.locale,
    proposed: r.proposed === 1,
    createdAt: r.created_at,
  };
}

/** A `proposals` row as the store hands it out. */
export function proposal(row: unknown): Proposal {
  const r = ProposalRecord.parse(row);
  return {
    project: r.project,
    userId: r.user_id,
    locale: r.locale,
    branch: r.branch,
    prNumber: r.pr_number,
    prUrl: r.pr_url,
    headSha: r.head_sha,
    updatedAt: r.updated_at,
  };
}

/** A row read by `read`, or null where the query found none. */
export function maybe<T>(row: unknown, read: (row: unknown) => T): T | null {
  return row ? read(row) : null;
}

/** The `id` column of each row. */
export function ids(rows: readonly unknown[]): string[] {
  return z
    .array(z.object({ id: z.string() }))
    .parse(rows)
    .map((r) => r.id);
}
