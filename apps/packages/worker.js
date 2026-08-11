// The SSR bundle re-exports its internal chunks by name, and workerd rejects any
// module-worker export that is not a handler. Only the handler crosses this file.
import handler from './dist/server/server.js';

export default handler;
