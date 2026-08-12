// This module's wire types. They live here, not in `@kroma/core`: the core
// client has no business knowing how an indexer is configured. `IndexerId`
// stays in core because core's own request/search flow carries release ids,
// an opaque brand, not this module's shape.

import { IndexerId } from '@kroma/module-sdk';
import { z } from 'zod';

/** One configured Torznab indexer (API key write-only). `categories` are raw
 * Torznab category numbers. */
export const IndexerView = z.object({
  id: IndexerId,
  name: z.string(),
  url: z.string(),
  hasApiKey: z.boolean(),
  categories: z.array(z.number()),
  enabled: z.boolean(),
  priority: z.number(),
  kind: z.string(),
  definitionId: z.string().nullable(),
  configuredSettings: z.array(z.string()),
  lastOkAt: z.number().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.number(),
});
export type IndexerView = z.infer<typeof IndexerView>;

/** `GET /indexers`. */
export const IndexersView = z.object({
  indexers: z.array(IndexerView),
});
export type IndexersView = z.infer<typeof IndexersView>;

/** `POST /indexers/:id/test` result (a `t=caps` round-trip). */
export const IndexerTestResult = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  serverTitle: z.string().nullable(),
  supportsTmdb: z.boolean(),
  error: z.string().nullable(),
});
export type IndexerTestResult = z.infer<typeof IndexerTestResult>;

/** Create/update body for an indexer (all fields optional patch; omitted
 * `apiKey` keeps the stored secret). */
export const SaveIndexerBody = z.object({
  name: z.string().nullable(),
  url: z.string().nullable(),
  apiKey: z.string().nullable(),
  categories: z.array(z.number()).nullable(),
  enabled: z.boolean().nullable(),
  priority: z.number().nullable(),
  kind: z.string().nullable().optional(),
  definitionId: z.string().nullable().optional(),
  settings: z.record(z.string(), z.string()).nullable().optional(),
});
export type SaveIndexerBody = z.infer<typeof SaveIndexerBody>;

/** One Cardigann definition in the browse list. */
export const IndexerDefinitionView = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  description: z.string(),
  links: z.array(z.string()),
});
export type IndexerDefinitionView = z.infer<typeof IndexerDefinitionView>;

/** `GET /indexers/definitions`. */
export const IndexerDefinitionsView = z.object({
  definitions: z.array(IndexerDefinitionView),
  synced: z.boolean(),
});
export type IndexerDefinitionsView = z.infer<typeof IndexerDefinitionsView>;

/** One configurable setting of a definition (for the add form). */
export const IndexerDefinitionSettingView = z.object({
  name: z.string(),
  kind: z.string(),
  label: z.string(),
  default: z.string().nullable(),
  options: z.array(z.tuple([z.string(), z.string()])),
});
export type IndexerDefinitionSettingView = z.infer<typeof IndexerDefinitionSettingView>;

/** `GET /indexers/definitions/:id`. */
export const IndexerDefinitionDetailView = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  description: z.string(),
  links: z.array(z.string()),
  settings: z.array(IndexerDefinitionSettingView),
});
export type IndexerDefinitionDetailView = z.infer<typeof IndexerDefinitionDetailView>;

/** `POST /indexers/definitions/sync` result. */
export const SyncDefinitionsResult = z.object({
  count: z.number(),
  version: z.string(),
});
export type SyncDefinitionsResult = z.infer<typeof SyncDefinitionsResult>;
