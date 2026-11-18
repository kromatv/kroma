import type { RequestContext } from '../../core/client';
import type { ImportId } from './ids';
import {
  Import,
  type ImportFolderAsk,
  ImportFolderList,
  ImportList,
  type ImportRequest,
  ImportStarted,
} from './schemas';

/** The imports of another media server: start one, and read how it stands. An
 * import runs as the job `household.import`, which is cancelled like any job. */
export default function importsApi(ctx: RequestContext) {
  return {
    /** Queue an import of what the owner kept, and start it. One runs at a
     * time: the server answers 409 while another one does. */
    start: (body: ImportRequest) => ctx.post('/admin/imports', ImportStarted, { body }),

    /** Where each folder of the other server is on this machine, in the order
     * asked: where an earlier import kept it, else under the same name. */
    folders: (body: ImportFolderAsk) =>
      ctx.post('/admin/imports/folders', ImportFolderList, { body }),

    /** Every import, the newest first. */
    list: () => ctx.get('/admin/imports', ImportList),

    /** One import, with its report as it stands now. */
    get: (id: ImportId) => ctx.get('/admin/imports/:id', Import, { params: { id } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    imports: ReturnType<typeof importsApi>;
  }
}
