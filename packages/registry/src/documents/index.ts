// The registry documents, by version. Versioned for the same reason the manifest
// is: `/schemas/1/registry.json` is a URL a publisher pins against, so v1 keeps
// its definition when v2 arrives beside it.

import type { z } from 'zod';
import {
  RegistryDescriptor as DescV1,
  RegistryIndex as IndexV1,
  ModuleRecord as RecordV1,
} from './v1.ts';

/** The document contract this build serves and reads. */
export const REGISTRY_API_VERSION = 1;

/** Every published document version, keyed by the `apiVersion` it describes. */
export const DOCUMENT_SCHEMAS: Record<number, Record<string, z.ZodType>> = {
  1: { registry: DescV1, index: IndexV1, module: RecordV1 },
};

export {
  Contribution,
  Integrity,
  ModuleRecord,
  PointDef,
  PointReq,
  RegistryArtifact,
  RegistryDescriptor,
  RegistryEntry,
  RegistryIndex,
  RegistryVersion,
} from './v1.ts';
