import { createCallable } from 'react-call';
import { BuiltinIndexerForm } from './builtin-indexer-form';
import type { IndexerView } from './schemas';

/** Create or edit a built-in (Cardigann) indexer from its definition schema.
 * Resolves `true` once a save/delete succeeds so the caller can refresh. */
export const BuiltinIndexerModal = createCallable<
  { definitionId: string; indexer: IndexerView | null },
  boolean
>(({ call, definitionId, indexer }) => (
  <BuiltinIndexerForm definitionId={definitionId} indexer={indexer} end={call.end} />
));
