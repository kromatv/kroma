import type { RequestContext } from '../../core/client';
import type { ModuleId } from './ids';
import { moduleApi } from './module-api';

/** The door to one module's own admin API, opened without a request. */
export default function modulesUrls(ctx: RequestContext) {
  return {
    /** The admin API of one module, addressed by its id. A module's routes are
     * its own: they live under `/api/admin/m/<id>`, so they are not part of this
     * facade and cannot collide with a core route. */
    api: (id: ModuleId) => moduleApi(ctx, id),
  };
}
