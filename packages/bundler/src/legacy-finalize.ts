// Finalizes a dual-bundle TV package after the LEGACY vite build (which runs
// after the modern one - see the shell's package.json):
//
//  1. Post-processes <dist>/legacy/style.css: the kroma-legacy-css shims, then
//     @csstools/postcss-cascade-layers (compiles @layer away - old engines drop
//     unknown at-rules wholesale), then Lightning CSS down-level + minify for
//     the target Chrome floor. Done here, on the emitted file, so the
//     transforms always see Tailwind's final output regardless of plugin order.
//
//  2. Rewrites <dist>/index.html into an engine-gated loader: Chrome 99+ (has
//     CSSLayerBlockRule, the modern tier's real floor - Tailwind v4 keeps its
//     cascade layers there) loads the untouched ESM bundle; anything older
//     loads the flattened ES2015 IIFE bundle. One package serves every
//     generation.

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import cascadeLayers from '@csstools/postcss-cascade-layers';
import { kromaLegacyCss } from '@kroma/bundler/legacy-css';
import { transform } from 'lightningcss';
import postcss from 'postcss';
import type { Plugin } from 'vite';

async function downlevelCss(distDir: string, chrome: number): Promise<void> {
  const path = join(distDir, 'legacy', 'style.css');
  const raw = readFileSync(path, 'utf8');
  const shimmed = await postcss([kromaLegacyCss(), cascadeLayers()]).process(raw, {
    from: path,
    map: false,
  });
  const { code } = transform({
    filename: 'style.css',
    code: Buffer.from(shimmed.css),
    minify: true,
    targets: { chrome: chrome << 16 },
  });
  writeFileSync(path, code);
}

function rewriteIndexHtml(distDir: string): void {
  const path = join(distDir, 'index.html');
  let html = readFileSync(path, 'utf8');
  const js = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/.exec(html);
  const css = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html);
  if (!js || !css) {
    throw new Error(
      'legacy-finalize: modern <script type=module> / stylesheet not found in dist/index.html',
    );
  }
  // The modulepreloads have to move INSIDE the gate: left in the document
  // they are plain <link>s, so an old engine fetches every modern chunk it
  // cannot run (measured at 1.04 MiB on webOS) before the legacy bundle it
  // needs even starts, silently. Re-emitted below on the modern branch so
  // that tier keeps its head start.
  const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/g)].map(
    (m) => m[1],
  );
  // Whitespace AFTER the tag, not before it: a leading `\s*` backtracks through
  // the whole indent run at every position the literal then fails to match.
  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');

  // The loader itself must be ES5: it is the one script every engine parses.
  const loader = `<script>
      /* Engine gate: Chrome 99+ (cascade layers) takes the modern ESM bundle;
         older engines take the ES2015 legacy bundle. */
      (function () {
        var modern = typeof window.CSSLayerBlockRule !== 'undefined';
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = modern ? '${css[1]}' : './legacy/style.css';
        document.head.appendChild(link);
        var script = document.createElement('script');
        if (modern) {
          var pre = ${JSON.stringify(preloads)};
          for (var i = 0; i < pre.length; i++) {
            var l = document.createElement('link');
            l.rel = 'modulepreload';
            l.crossOrigin = '';
            l.href = pre[i];
            document.head.appendChild(l);
          }
          script.type = 'module';
          script.crossOrigin = '';
          script.src = '${js[1]}';
        } else {
          script.src = './legacy/index.js';
        }
        document.body.appendChild(script);
      })();
    </script>`;
  html = html.replace(js[0], '').replace(css[0], '');
  html = html.replace('</body>', `${loader}\n  </body>`);
  writeFileSync(path, html);
}

// Drops every legacy asset that is byte-for-byte the modern tier's, and
// points the legacy bundle at the one remaining copy: the two tiers are
// separate Vite builds, so each emitted its own copy of the brand intro -
// 7.8 MB, 42% of the whole TV package, duplicated for nothing. Content
// hashing makes this safe and cheap: identical bytes already carry
// identical names.
function dedupeAssets(distDir: string): number {
  const legacyAssets = join(distDir, 'legacy', 'assets');
  const modernAssets = join(distDir, 'assets');
  if (!existsSync(legacyAssets) || !existsSync(modernAssets)) return 0;

  let saved = 0;
  const shared: string[] = [];
  for (const name of readdirSync(legacyAssets)) {
    const legacyFile = join(legacyAssets, name);
    const modernFile = join(modernAssets, name);
    if (!existsSync(modernFile)) continue;
    // Size first: it rejects any genuine mismatch for the price of a stat, and
    // the pair here includes an 8 MB video that would otherwise be read twice.
    const size = statSync(legacyFile).size;
    if (statSync(modernFile).size !== size) continue;
    if (!readFileSync(legacyFile).equals(readFileSync(modernFile))) continue;
    saved += size;
    rmSync(legacyFile);
    shared.push(name);
  }
  if (shared.length === 0) return 0;

  // Each file has exactly ONE prefix, because of where its URLs resolve from:
  // the JS against the document (dist/index.html), the stylesheet against itself.
  const rewrite = (file: string, from: string, to: string) => {
    const p = join(distDir, file);
    if (!existsSync(p)) return;
    let text = readFileSync(p, 'utf8');
    for (const name of shared) text = text.split(from + name).join(to + name);
    writeFileSync(p, text);
  };
  rewrite('legacy/index.js', './legacy/assets/', './assets/');
  rewrite('legacy/style.css', './assets/', '../assets/');
  return saved;
}

/** `distDir` = the shell's absolute dist dir; `chrome` = the legacy tier's floor. */
export function legacyFinalize({ distDir, chrome }: { distDir: string; chrome: number }): Plugin {
  return {
    name: 'kroma-legacy-finalize',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      await downlevelCss(distDir, chrome);
      rewriteIndexHtml(distDir);
      const saved = dedupeAssets(distDir);
      if (saved > 0) {
        this.info?.(
          `[legacy] deduped ${(saved / 1024 / 1024).toFixed(2)} MB shared with the modern tier`,
        );
      }
    },
  };
}
