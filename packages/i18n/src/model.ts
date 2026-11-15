// The catalog model on its own, for a tool that reads catalogs outside a
// bundler. Every import below is spelled with its extension and reaches
// nothing that is not, because Node loads this file as written when a Vite
// config imports it.
export { renderModuleTypes } from './catalog-types.ts';
export { tokensIn } from './interpolate.ts';
export { type CatalogPath, namespaceOf, namespaceOfFile, parseCatalogPath } from './layout.ts';
export { LABEL_NAMESPACE, labelKey } from './locales.ts';
export {
  baseKeys,
  generalForm,
  groupMessages,
  type Message,
  variablesOf,
  variantOf,
} from './messages.ts';
export {
  fallbackChain,
  isOffered,
  type Project,
  parentTags,
  type Stage,
  stageOf,
} from './project.ts';
export type { Catalog } from './types.ts';
