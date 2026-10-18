import type { Plugin } from 'vite';
import { compileReactSource } from './react-compiler-transform.cjs';

/** Compile original JSX with Oxc before the host's JSX and Refresh transforms. */
export function reactCompiler(): Plugin {
  return {
    name: 'kroma:oxc-react-compiler',
    enforce: 'pre',
    transform: {
      order: 'pre',
      handler(source, id) {
        const result = compileReactSource(source, id);
        return result ? { code: result.code, map: result.map ?? null } : null;
      },
    },
  };
}
