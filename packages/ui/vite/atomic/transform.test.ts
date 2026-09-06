import { beforeAll, describe, expect, it } from 'vitest';
import { ModuleLoader } from './module-scope.ts';
import { transformModule } from './transform.ts';
import { resolveAsBrowser } from './web-theme.ts';

const REPO = '/repo';

const FILE = `${REPO}/packages/ui/src/probe.tsx`;

const loader = new ModuleLoader({ repoRoot: REPO });

const run = (code: string, inject = false) => transformModule({ code, file: FILE, loader, inject });

beforeAll(() => resolveAsBrowser());

describe('transformModule', () => {
  it('compiles each static entry of a set and leaves the rest as written', () => {
    const out = run(`import { styles } from '#ui/core';
const s = styles({
  row: { row: true, gap: 6 },
  fluid: { px: { base: 8, md: 12 } },
  computed: { width: measure() },
});`);

    expect(out?.compiled).toBe(2);
    expect(out?.code).toContain("import { staticStyle as __kromaStatic } from '#ui/core/atomic';");
    expect(out?.code).toContain('row: __kromaStatic({"flexDirection":"row","gap":6})');
    expect(out?.code).toMatch(/fluid: __kromaStatic\(\{"paddingLeft":"var\(--k[\w-]{6},8px\)"/);
    expect(out?.code).toContain('computed: { width: measure() }');
    expect(out?.skipped).toEqual([{ line: 5, reason: 'a call to measure' }]);
    expect(out?.rules.map((rule) => rule.css)).toContain(
      out?.rules.find((rule) => rule.css.includes('flex-direction:row'))?.css,
    );
    expect(out?.map?.mappings.length).toBeGreaterThan(0);
  });

  it('compiles the single form and a recipe with its states', () => {
    const out = run(`import { style, sv } from '@kroma/ui/kit';
const one = style({ p: 4 });
const chip = sv({
  base: { radius: 'pill', _hover: { bg: 'tint/10' } },
  variants: { tone: { neutral: { bg: 'tint/6' }, accent: { bg: 'accent' } } },
  compound: [{ when: { tone: 'accent' }, style: { border: 'accent/45' } }],
  defaults: { tone: 'neutral' },
});`);

    expect(out?.compiled).toBe(5);
    expect(out?.code).toMatch(/const one = style\(__kromaStatic\(/);
    expect(out?.code).toContain(
      'base: __kromaStatic({"borderRadius":999},{hover:__kromaStatic({"backgroundColor":"var(--kroma-tint-10)"})})',
    );
    expect(out?.code).toContain("when: { tone: 'accent' }, style: __kromaStatic(");
    expect(out?.code).toContain("defaults: { tone: 'neutral' }");
  });

  it('leaves a recipe whole when one of its layers cannot be read', () => {
    const out = run(`import { sv } from '#ui/core';
const chip = sv({
  base: { radius: 'pill' },
  variants: { size: { sm: { px: 8 }, fluid: { px: measure() } } },
});
const s = styles({ a: { p: 1 } });
import { styles } from '#ui/core';`);

    expect(out?.compiled).toBe(1);
    expect(out?.code).toContain("base: { radius: 'pill' }");
    expect(out?.skipped).toEqual([{ line: 4, reason: 'a call to measure' }]);
  });

  it('compiles only the slots svFor types as styles', () => {
    const out = run(`import { type StyleDecl, svFor } from '#ui/core';
const v = svFor<{ root: StyleDecl; icon: Pick<IconProps, 'color'> }>()({
  slots: { root: { row: true }, icon: { color: 'text', size: 20 } },
  variants: { tone: { accent: { root: { bg: 'accent' }, icon: { color: 'accentInk' } } } },
});`);

    expect(out?.compiled).toBe(2);
    expect(out?.code).toContain("icon: { color: 'text', size: 20 }");
    expect(out?.code).toContain("icon: { color: 'accentInk' }");
    expect(out?.code).toMatch(/root: __kromaStatic\(/);
  });

  it("touches only the kit's own bindings", () => {
    expect(
      run("import { styles } from './my-styles';\nconst s = styles({ a: { p: 1 } });"),
    ).toBeNull();
    expect(run("import { styles } from '#ui/core';\nexport const nothing = 1;")).toBeNull();
    expect(run('const s = styles({ a: { p: 1 } });')).toBeNull();
  });

  it('injects its rules at load for a dev server', () => {
    const out = run(
      "import { styles } from '#ui/core';\nconst s = styles({ a: { opacity: 0.5 } });",
      true,
    );

    expect(out?.code).toContain('injectRules as __kromaInject');
    expect(out?.code).toMatch(/__kromaInject\(\[\[3,"\.[a-d][\w-]{5}\{opacity:0\.5;\}"\]\]\);/);
  });

  it('leaves a declaration that is not an object, and says so', () => {
    const out = run("import { style } from '#ui/core';\nexport const s = style(5);");
    expect(out?.skipped.map((skip) => skip.reason)).toEqual([
      'a declaration that is not an object',
    ]);
  });

  it('leaves a recipe whose config or layers are not written inline', () => {
    const config = run(
      "import { sv } from '#ui/core';\nconst C = { base: { p: 4 } };\nexport const v = sv(C);",
    );
    expect(config?.skipped.map((skip) => skip.reason)).toEqual(['a recipe not written inline']);
    const layer = run(
      "import { sv } from '#ui/core';\nconst SM = { root: { p: 1 } };\nexport const v = sv({ slots: { root: { p: 2 } }, variants: { size: { sm: SM } } });",
    );
    expect(layer?.skipped.map((skip) => skip.reason)).toEqual(['a layer not written inline']);
  });

  it('leaves an svFor whose slot type is named rather than written', () => {
    const out = run(
      "import { svFor } from '#ui/core';\ntype Slots = { root: object };\nexport const v = svFor<Slots>()({ slots: { root: { p: 2 } } });",
    );
    expect(out?.skipped.map((skip) => skip.reason)).toEqual(['svFor without an inline slot type']);
  });
});
