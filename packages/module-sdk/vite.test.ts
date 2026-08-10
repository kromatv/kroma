import { describe, expect, it } from 'vitest';
import { kromaModule } from './vite';

type TransformResult = { code: string; map: null } | null;

function transform(id: string, code: string): TransformResult {
  const hook = kromaModule().transform;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  return (handler as (code: string, id: string) => TransformResult).call(null, code, id);
}

const ENTRY = '/repo/modules/tv.kroma.notes/ui/src/index.tsx';
const SOURCE = "import { defineModule } from '@kroma/module-sdk';\ndefineModule({ id: 'x' });\n";

describe('kromaModule', () => {
  it('runs before Vite expands import.meta.glob, or the injected glob stays a call', () => {
    const plugin = kromaModule();
    expect(plugin.name).toBe('kroma-module');
    expect(plugin.enforce).toBe('pre');
  });

  it('injects the manifest and the locale glob into a module entry', () => {
    const out = transform(ENTRY, SOURCE);
    expect(out?.code).toContain("import __kromaManifest from '../../module.json';");
    expect(out?.code).toContain('manifest: __kromaManifest');
    expect(out?.code).toContain("import.meta.glob('../../locales/*.json'");
    expect(out?.code).toContain("id: 'x'");
    expect(out?.map).toBeNull();
  });

  it('takes the module-federation entry and the .ts spelling too', () => {
    for (const id of [
      '/repo/modules/x/ui/src/module.tsx',
      '/repo/modules/x/ui/src/index.ts',
      'C:\\repo\\modules\\x\\ui\\src\\index.tsx',
    ]) {
      expect(transform(id, SOURCE)).not.toBeNull();
    }
  });

  it('reads the path out of an id carrying a Vite query', () => {
    expect(transform(`${ENTRY}?v=abc123`, SOURCE)).not.toBeNull();
  });

  it('leaves every other file alone', () => {
    for (const id of [
      '/repo/modules/x/ui/src/panel.tsx',
      '/repo/modules/x/src/index.tsx',
      '/repo/modules/x/ui/index.tsx',
    ]) {
      expect(transform(id, SOURCE)).toBeNull();
    }
  });

  it('leaves the explicit defineModule(manifest, { ... }) form untouched', () => {
    expect(transform(ENTRY, 'defineModule(manifest, { id: "x" });')).toBeNull();
    expect(transform(ENTRY, 'export const nothing = 1;')).toBeNull();
  });
});
