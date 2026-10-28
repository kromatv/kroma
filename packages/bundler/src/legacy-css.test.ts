import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { kromaLegacyCss } from './legacy-css';

async function shim(css: string): Promise<string> {
  return (await postcss([kromaLegacyCss()]).process(css, { from: undefined })).css;
}

const INSETS =
  '.abs{position:absolute}.l0{left:0px}.r0{right:0}.t0{top:0px}.b0{bottom:0%}.l8{left:8px}';

describe('kromaLegacyCss', () => {
  it('stretches a button pinned by both horizontal insets to the full width', async () => {
    const out = await shim(INSETS);

    expect(out).toContain('button.abs.l0.r0');
    expect(out).toMatch(/button\.abs\.l0\.r0\s*\{\s*width:\s*100%/);
  });

  it('stretches a button pinned by both vertical insets to the full height', async () => {
    const out = await shim(INSETS);

    expect(out).toMatch(/button\.abs\.t0\.b0\s*\{\s*height:\s*100%/);
  });

  it('leaves a non-zero inset out of the stretch', async () => {
    const out = await shim(INSETS);

    expect(out).not.toContain('.l8.r0');
  });

  it('adds nothing to a sheet without absolute positioning', async () => {
    const out = await shim('.l0{left:0}.r0{right:0}');

    expect(out).not.toContain('button');
  });
});
