// Add / edit modals for indexers. Two kinds coexist:
//  - Torznab (Jackett / Prowlarr endpoint): name + URL + API key.
//  - Built-in (native Cardigann definition): a browse/pick step then a form
//    generated from the definition's own settings schema.

import { createCallable } from 'react-call';
import { BuiltinIndexerForm } from './builtin-indexer-form';
import type { IndexerView } from './schemas';
import { TorznabIndexerForm } from './torznab-indexer-form';

/** Router for EDITING an existing indexer: a built-in row edits in the settings
 * form, a Torznab row in the endpoint form. Creation goes through the generic
 * add-picker (Torznab) or the definition picker (built-in), not this modal.
 * Resolves `true` once a save/delete succeeds so the caller can refresh. */
export const IndexerModal = createCallable<{ indexer: IndexerView }, boolean>(
  ({ call, indexer }) => {
    if (indexer.kind === 'builtin' && indexer.definitionId) {
      return (
        <BuiltinIndexerForm definitionId={indexer.definitionId} indexer={indexer} end={call.end} />
      );
    }
    return <TorznabIndexerForm indexer={indexer} end={call.end} />;
  },
);
