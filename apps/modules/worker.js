// workerd rejects any module-worker export that is not a handler, and the SSR
// bundle re-exports its internal chunks by name.
import handler from './dist/server/server.js';

export default handler;
