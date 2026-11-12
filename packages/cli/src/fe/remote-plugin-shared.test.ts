import { describe, expect, it } from 'vitest';
import { kromaRemote } from './remote-plugin';

interface Emitted {
  type: string;
  fileName: string;
  source: string;
}

interface Chunk {
  type: 'chunk';
  code: string;
  imports: string[];
  moduleIds: string[];
}

interface Hooks {
  transform: (this: unknown, code: string, id: string) => Promise<unknown>;
  generateBundle: (this: unknown, options: unknown, bundle: Record<string, Chunk>) => void;
}

const ENTRY = '/m/ui/src/module.ts';
const PAGE = '/m/ui/src/page.tsx';
const SHARED_CHUNK = '/m/ui/src/labels.ts';

function plugin(): Hooks {
  const [, shared] = kromaRemote({
    entry: ENTRY,
    manifestPath: '/m/module.json',
    localesDir: '/m/locales',
  });
  return shared as unknown as Hooks;
}

async function declared(
  files: Record<string, string>,
  bundle: Record<string, Chunk>,
): Promise<Record<string, string[]>> {
  const shared = plugin();
  const emitted: Emitted[] = [];
  const ctx = {
    error(message: string): never {
      throw new Error(message);
    },
    emitFile(file: Emitted) {
      emitted.push(file);
      return file.fileName;
    },
  };
  for (const [id, code] of Object.entries(files)) await shared.transform.call(ctx, code, id);
  shared.generateBundle.call(ctx, {}, bundle);
  const file = emitted.find((e) => e.fileName === 'shared.json');
  if (!file) throw new Error('no shared.json emitted');
  return JSON.parse(file.source) as Record<string, string[]>;
}

const chunk = (moduleIds: string[], imports: string[] = []): Chunk => ({
  type: 'chunk',
  code: '',
  imports,
  moduleIds,
});

describe('the shared declaration', () => {
  it('names what the entry takes from the host, and nothing a lazy page takes', async () => {
    const files = {
      [ENTRY]: [
        "import { defineModule } from '@kromatv/module-sdk';",
        "import { lazy } from 'react';",
        "export default defineModule({ pages: [{ component: lazy(() => import('./page')) }] });",
      ].join('\n'),
      [PAGE]: "import { Button } from '@kromatv/ui/kit';\nexport default Button;",
    };

    const reads = await declared(files, {
      'remoteEntry.js': chunk([ENTRY]),
      'page-A1b2C3d4.js': chunk([PAGE]),
    });

    expect(reads).toEqual({ '@kromatv/module-sdk': ['defineModule'], react: ['lazy'] });
  });

  it('follows the chunks the entry imports statically', async () => {
    const files = {
      [ENTRY]: "import { label } from './labels';\nexport default label;",
      [SHARED_CHUNK]: "import { useFormat } from '@kromatv/ui';\nexport const label = useFormat;",
    };

    const reads = await declared(files, {
      'remoteEntry.js': chunk([ENTRY], ['labels-A1b2C3d4.js']),
      'labels-A1b2C3d4.js': chunk([SHARED_CHUNK]),
    });

    expect(reads).toEqual({ '@kromatv/ui': ['useFormat'] });
  });

  it('marks a namespace, a default and a bare import as reads of the whole package', async () => {
    const files = {
      [ENTRY]: [
        "import * as Kit from '@kromatv/ui/kit';",
        "import React from 'react';",
        "import '@kromatv/core';",
        'export default [Kit, React];',
      ].join('\n'),
    };

    const reads = await declared(files, { 'remoteEntry.js': chunk([ENTRY]) });

    expect(reads).toEqual({ '@kromatv/core': ['*'], '@kromatv/ui/kit': ['*'], react: ['default'] });
  });
});
