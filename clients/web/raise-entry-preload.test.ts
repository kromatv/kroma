import { describe, expect, it } from 'vitest';
import { raiseEntryPreload } from './raise-entry-preload';

const shell = (
  head: string,
  body = '<script type="module" async="" src="/assets/index-A1b2C3d4.js"></script>',
) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe('raiseEntryPreload', () => {
  it('preloads the entry script at high priority', () => {
    const html = shell(
      '<link rel="modulepreload" href="/assets/index-A1b2C3d4.js" fetchPriority="low"/>',
    );

    const raised = raiseEntryPreload(html);

    expect(raised).toContain(
      '<link rel="modulepreload" href="/assets/index-A1b2C3d4.js" fetchPriority="high"/>',
    );
  });

  it('leaves every other route preload low', () => {
    const html = shell(
      '<link rel="modulepreload" href="/assets/index-A1b2C3d4.js" fetchPriority="low"/><link rel="modulepreload" href="/assets/_app-Z9y8X7w6.js" fetchPriority="low"/>',
    );

    const raised = raiseEntryPreload(html);

    expect(raised).toContain(
      '<link rel="modulepreload" href="/assets/_app-Z9y8X7w6.js" fetchPriority="low"/>',
    );
  });

  it('returns a page without a module entry unchanged', () => {
    const html = shell(
      '<link rel="modulepreload" href="/assets/x-A1b2C3d4.js" fetchPriority="low"/>',
      '',
    );

    expect(raiseEntryPreload(html)).toBe(html);
  });
});
