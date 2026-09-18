import { describe, expect, it } from 'vitest';
import { embeds, uncovered, warmUpCopies } from './embeds';

const DOCKERFILE = `FROM node AS web
COPY . .
FROM rust AS builder
COPY server/crates ./server/crates
COPY modules ./modules
COPY packages/core/src/locales ./packages/core/src/locales
COPY packages/core/assets/ ./packages/core/assets
WORKDIR /src/server
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs && cargo build
COPY packages ./packages
`;

describe('what a crate embeds', () => {
  it('finds a plain relative include and one through the manifest dir, resolved to the repo', () => {
    const found = embeds({
      'server/crates/kroma-engine/src/services/email/render.rs': `
        const A: &str = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/core/assets/email/reset.template.html"
        ));
        const B: &[u8] = include_bytes!("../../../../../../packages/core/assets/email/logo.png");`,
    });

    expect(found.map((e) => e.path)).toEqual([
      'packages/core/assets/email/reset.template.html',
      'packages/core/assets/email/logo.png',
    ]);
  });

  it('reads a build script’s path literal, and leaves what is not under packages alone', () => {
    const found = embeds({
      'server/crates/kroma-engine/build.rs':
        'const LOCALES: &str = "../../../packages/core/src/locales"; let x = "../other";',
      'modules/tv.kroma.scene/server/src/lib.rs': 'include_str!("../module.json")',
    });

    expect(found.map((e) => e.path)).toEqual(['packages/core/src/locales']);
  });

  it('ignores what only the tests embed', () => {
    const found = embeds({
      'server/crates/kroma-domain/src/slug.rs': `
        pub fn slug() {}
        #[cfg(test)]
        mod tests {
            const CASES: &str = include_str!("../../../../packages/core/src/slug.fixture.json");
        }`,
    });

    expect(found).toEqual([]);
  });
});

describe('the warm-up stage', () => {
  it('lists the builder stage’s copies before the stub main, and not another stage’s', () => {
    expect(warmUpCopies(DOCKERFILE)).toEqual([
      'server/crates',
      'modules',
      'packages/core/src/locales',
      'packages/core/assets',
    ]);
  });

  it('names the embed nothing copied yet', () => {
    const all = [
      { from: 'a.rs', path: 'packages/core/assets/email/logo.png' },
      { from: 'b.rs', path: 'packages/core/src/locales' },
      { from: 'c.rs', path: 'packages/ui/src/assets/fonts/x.ttf' },
    ];

    expect(uncovered(all, warmUpCopies(DOCKERFILE)).map((e) => e.path)).toEqual([
      'packages/ui/src/assets/fonts/x.ttf',
    ]);
  });
});
