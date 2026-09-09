import { describe, expect, it } from 'vitest';
import { kromaRemote } from './remote-plugin';

const HELPER_IMPORT = 'import { __kroma_shared } from "virtual:kroma-shared";\n';

interface Ctx {
  error: (message: string) => never;
}

type Transform = (
  this: Ctx,
  code: string,
  id: string,
) => Promise<{ code: string; map: unknown } | null>;

const ctx: Ctx = {
  error(message) {
    throw new Error(message);
  },
};

function transformOf(): Transform {
  const [, shared] = kromaRemote({
    entry: '/m/ui/src/module.tsx',
    manifestPath: '/m/module.json',
    localesDir: '/m/locales',
  });
  return (shared as unknown as { transform: Transform }).transform;
}

async function rewrite(code: string): Promise<string> {
  const out = await transformOf().call(ctx, code, '/m/ui/src/page.tsx');
  if (!out) throw new Error(`nothing was rewritten in: ${code}`);
  if (!out.code.startsWith(HELPER_IMPORT)) throw new Error(`no helper import: ${out.code}`);
  return out.code.slice(HELPER_IMPORT.length).trim();
}

describe('rewriting an import of a package the host provides', () => {
  it('turns a side-effect import into a bare read', async () => {
    expect(await rewrite("import 'react';")).toBe('__kroma_shared("react");;');
  });

  it('takes a default binding off the namespace’s `default`', async () => {
    expect(await rewrite("import React from 'react';\nexport const a = React;")).toContain(
      'const __ks0 = __kroma_shared("react"); const React = __ks0.default;',
    );
  });

  it('binds a namespace import to the namespace itself', async () => {
    expect(await rewrite("import * as React from 'react';\nexport const a = React;")).toContain(
      'const __ks0 = __kroma_shared("react"); const React = __ks0;',
    );
  });

  it('destructures a named import, alias and all', async () => {
    expect(
      await rewrite(
        "import { useState as us, useRef } from 'react';\nexport const a = [us, useRef];",
      ),
    ).toContain('const { useState: us, useRef } = __ks0;');
  });

  it('reads a default and its named siblings off one temporary', async () => {
    expect(
      await rewrite(
        "import React, { useState } from 'react';\nexport const a = [React, useState];",
      ),
    ).toContain(
      'const __ks0 = __kroma_shared("react"); const { useState } = __ks0; const React = __ks0.default;',
    );
  });

  it('re-exports each name the host’s namespace carries', async () => {
    expect(await rewrite("export { Button as B, Text } from '@kromatv/ui/kit';")).toContain(
      'export const B = __ks0.Button; export const Text = __ks0.Text;',
    );
  });

  it('resolves a dynamic import without waiting for a network the host already loaded', async () => {
    expect(await rewrite("const m = await import('react');\nexport const a = m;")).toContain(
      'const m = await Promise.resolve(__kroma_shared("react"));',
    );
  });
});

describe('which key a specifier is read under', () => {
  it('folds a deep kit path onto the barrel the host holds one copy of', async () => {
    expect(
      await rewrite(
        "import { Button } from '@kromatv/ui/kit/atoms/button';\nexport const a = Button;",
      ),
    ).toContain('__kroma_shared("@kromatv/ui/kit")');
  });

  it('keeps a client domain under its own name', async () => {
    expect(
      await rewrite(
        "import { Requests } from '@kromatv/client/requests';\nexport const a = Requests;",
      ),
    ).toContain('__kroma_shared("@kromatv/client/requests")');
  });
});

describe('a file with more than one of them', () => {
  it('gives each import its own temporary and one source map', async () => {
    const out = await transformOf().call(
      ctx,
      "import { useState } from 'react';\nimport { Button } from '@kromatv/ui/kit';\nimport { z } from 'zod';\nexport const a = [useState, Button, z];",
      '/m/ui/src/page.tsx',
    );

    expect(out?.code).toContain('const __ks0 = __kroma_shared("react");');
    expect(out?.code).toContain('const __ks1 = __kroma_shared("@kromatv/ui/kit");');
    expect(out?.code).toContain("import { z } from 'zod';");
    expect(out?.map).toMatchObject({ mappings: expect.any(String) });
  });
});
