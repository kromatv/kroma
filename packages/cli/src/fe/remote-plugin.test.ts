import { describe, expect, it } from 'vitest';
import { kromaRemote } from './remote-plugin';

const ENTRY = '/m/ui/src/module.tsx';

interface Ctx {
  error: (message: string) => never;
}

type Resolved = string | { id: string; external: boolean } | null;

interface Chunk {
  type: string;
  code?: string;
}

interface ManifestHooks {
  transform: (code: string, id: string) => { code: string; map: null } | null;
}

interface SharedHooks {
  resolveId: (this: Ctx, id: string, importer?: string) => Resolved;
  load: (this: Ctx, id: string) => string | null;
  transform: (
    this: Ctx,
    code: string,
    id: string,
  ) => Promise<{ code: string; map: unknown } | null>;
  generateBundle: (this: Ctx, options: unknown, bundle: Record<string, Chunk>) => void;
}

const ctx: Ctx = {
  error(message) {
    throw new Error(message);
  },
};

function plugins(): [ManifestHooks, SharedHooks] {
  const [manifest, shared] = kromaRemote({
    entry: ENTRY,
    manifestPath: '/m/module.json',
    localesDir: '/m/locales',
  });
  return [manifest as unknown as ManifestHooks, shared as unknown as SharedHooks];
}

const manifestPlugin = (): ManifestHooks => plugins()[0];
const sharedPlugin = (): SharedHooks => plugins()[1];

describe('the manifest plugin', () => {
  it('hands the entry its manifest and its locales, by a path relative to itself', () => {
    const out = manifestPlugin().transform("export default defineModule({ id: 'x' });\n", ENTRY);

    expect(out?.code).toContain("import __kromaManifest from '../../module.json';");
    expect(out?.code).toContain(
      "locales: import.meta.glob('../../locales/*.json', { eager: true, import: 'default' })",
    );
    expect(out?.code).toContain('defineModule({ manifest: __kromaManifest,');
  });

  it('still recognises the entry behind a query suffix', () => {
    const out = manifestPlugin().transform('export default defineModule({});\n', `${ENTRY}?used`);

    expect(out?.code).toContain('__kromaManifest');
  });

  it('leaves every other file alone', () => {
    const out = manifestPlugin().transform(
      "export default defineModule({ id: 'x' });\n",
      '/m/ui/src/page.tsx',
    );

    expect(out).toBeNull();
  });

  it('leaves the explicit two-argument call alone, which is the escape hatch', () => {
    const out = manifestPlugin().transform(
      'export default defineModule(manifest, { locales });\n',
      ENTRY,
    );

    expect(out).toBeNull();
  });
});

describe('the shared plugin’s resolution', () => {
  it('owns the helper’s virtual id', () => {
    expect(sharedPlugin().resolveId.call(ctx, 'virtual:kroma-shared')).toBe(
      '\0virtual:kroma-shared',
    );
  });

  it('makes a package the host provides external, deep kit paths folded onto the barrel', () => {
    const resolve = sharedPlugin().resolveId;

    expect(resolve.call(ctx, 'react')).toEqual({
      id: 'virtual:kroma-shared:react',
      external: true,
    });
    expect(resolve.call(ctx, '@kroma/ui/kit/atoms/button')).toEqual({
      id: 'virtual:kroma-shared:@kroma/ui/kit',
      external: true,
    });
    expect(resolve.call(ctx, '@kroma/client/requests')).toEqual({
      id: 'virtual:kroma-shared:@kroma/client/requests',
      external: true,
    });
  });

  it('refuses a @kroma package the host does not provide, and says what it does', () => {
    const resolve = sharedPlugin().resolveId;

    expect(() => resolve.call(ctx, '@kroma/registry', '/m/ui/src/page.tsx')).toThrow(
      /\/m\/ui\/src\/page\.tsx imports '@kroma\/registry'/,
    );
    expect(() => resolve.call(ctx, '@kroma/registry')).toThrow(/@kroma\/ui\/kit/);
  });

  it('leaves anything the bundle carries itself to Vite', () => {
    const resolve = sharedPlugin().resolveId;

    expect(resolve.call(ctx, './page')).toBeNull();
    expect(resolve.call(ctx, 'zod')).toBeNull();
  });
});

describe('the shared plugin’s helper', () => {
  it('reads the host’s global and refuses to run outside a KROMA client', () => {
    const code = sharedPlugin().load.call(ctx, '\0virtual:kroma-shared');

    expect(code).toContain('export function __kroma_shared(key)');
    expect(code).toContain('globalThis["__KROMA_SHARED__"]');
    expect(code).toContain('this bundle only runs inside a KROMA client');
  });

  it('loads nothing else', () => {
    expect(sharedPlugin().load.call(ctx, '/m/ui/src/page.tsx')).toBeNull();
  });
});

describe('what the shared plugin declines to transform', () => {
  it('skips a file that is not a script', async () => {
    const out = await sharedPlugin().transform.call(ctx, "@import 'react';", '/m/ui/src/app.css');

    expect(out).toBeNull();
  });

  it('skips a virtual module, the helper it just emitted included', async () => {
    const out = await sharedPlugin().transform.call(
      ctx,
      "import 'react';",
      '\0virtual:kroma-shared',
    );

    expect(out).toBeNull();
  });

  it('skips a file with neither an import nor an export', async () => {
    const out = await sharedPlugin().transform.call(ctx, 'const a = 1;', '/m/ui/src/page.tsx');

    expect(out).toBeNull();
  });

  it('leaves a file whose imports the host provides none of', async () => {
    const out = await sharedPlugin().transform.call(
      ctx,
      "import { z } from 'zod';\nexport const s = z;",
      '/m/ui/src/schemas.ts',
    );

    expect(out).toBeNull();
  });
});

describe('what the shared plugin refuses', () => {
  it('refuses an entry that does not default-export its module', async () => {
    await expect(
      sharedPlugin().transform.call(ctx, "export const page = 'x';", ENTRY),
    ).rejects.toThrow(/the module entry must `export default defineModule/);
  });

  it('refuses `export * from` a package the host provides, which has nothing to name', async () => {
    await expect(
      sharedPlugin().transform.call(ctx, "export * from '@kroma/ui/kit';", '/m/ui/src/kit.ts'),
    ).rejects.toThrow(/`export \* from '@kroma\/ui\/kit'` is not supported/);
  });
});

describe('the stylesheet link', () => {
  it('is prepended to the remote entry when the build emitted one', () => {
    const bundle = {
      'style.css': { type: 'asset' },
      'remoteEntry.js': { type: 'chunk', code: 'export default 1;' },
    };

    sharedPlugin().generateBundle.call(ctx, {}, bundle);

    expect(bundle['remoteEntry.js'].code).toContain("link.rel = 'stylesheet';");
    expect(bundle['remoteEntry.js'].code).toContain('new URL("./style.css", import.meta.url).href');
    expect(bundle['remoteEntry.js'].code).toContain('export default 1;');
  });

  it('is absent when the module has no styles of its own', () => {
    const bundle = { 'remoteEntry.js': { type: 'chunk', code: 'export default 1;' } };

    sharedPlugin().generateBundle.call(ctx, {}, bundle);

    expect(bundle['remoteEntry.js'].code).toBe('export default 1;');
  });
});
