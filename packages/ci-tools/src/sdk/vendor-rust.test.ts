import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CLOSURE, concreteDep, standaloneCargoToml, vendorRust } from './vendor-rust';

const WORKSPACE = {
  package: { edition: '2021', 'rust-version': '1.88', license: 'MIT' },
  dependencies: {
    'kroma-module-manifest': { path: 'crates/kroma-module-manifest' },
    'kroma-sqlite': { path: 'crates/kroma-sqlite' },
    'kroma-testing': { path: 'crates/kroma-testing' },
    'kroma-engine': { path: 'crates/kroma-engine' },
    serde: { version: '1', features: ['derive'] },
  },
};

const MEMBER = `[package]
name = "kroma-module-sdk"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
kroma-module-manifest = { workspace = true }
kroma-sqlite = { workspace = true, optional = true }
kroma-testing = { workspace = true, optional = true }
# The whole core, for the two modules that orchestrate it.
kroma-engine = { workspace = true, optional = true }
serde = { workspace = true }

[features]
storage = ["dep:kroma-sqlite", "kroma-module-host/storage"]
testing = ["kroma-sqlite/testing", "kroma-engine?/testing", "dep:kroma-testing"]
engine = ["dep:kroma-engine", "storage"]

[dev-dependencies]
kroma-testing = { workspace = true }
`;

const CRATE = (name: string) => `[package]
name = "${name}"
version = "0.0.1"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
serde = { workspace = true }
`;

const ROOT = mkdtempSync(join(tmpdir(), 'kroma-vendor-'));

function seedServer(dir: string, crates: readonly string[]): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'Cargo.toml'),
    `[workspace.package]
edition = "2021"
rust-version = "1.88"
license = "MIT"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
`,
  );
  for (const crate of crates) {
    mkdirSync(join(dir, 'crates', crate, 'src'), { recursive: true });
    writeFileSync(join(dir, 'crates', crate, 'Cargo.toml'), CRATE(crate));
    writeFileSync(join(dir, 'crates', crate, 'src', 'lib.rs'), '');
  }
  return dir;
}

const SERVER = seedServer(join(ROOT, 'server'), CLOSURE);
mkdirSync(join(SERVER, 'crates', 'kroma-sqlite', 'tests'));
writeFileSync(join(SERVER, 'crates', 'kroma-sqlite', 'tests', 'round_trip.rs'), '');

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('concreteDep', () => {
  it('takes the version and the features the workspace declares', () => {
    expect(concreteDep('serde', { workspace: true }, { version: '1', features: ['derive'] })).toBe(
      '{ version = "1", features = ["derive"] }',
    );
  });

  it('reads a bare string workspace spec as a version', () => {
    expect(concreteDep('anyhow', { workspace: true }, '1')).toBe('{ version = "1" }');
  });

  it('keeps what the member added on top, optional included', () => {
    expect(
      concreteDep('tokio', { workspace: true, optional: true }, { version: '1', features: ['rt'] }),
    ).toBe('{ version = "1", features = ["rt"], optional = true }');
  });

  it('merges the two feature lists without repeating a name', () => {
    expect(
      concreteDep(
        'chrono',
        { workspace: true, features: ['clock', 'serde'] },
        { version: '0.4', features: ['clock', 'std'] },
      ),
    ).toBe('{ version = "0.4", features = ["clock", "std", "serde"] }');
  });

  it('turns a closure crate into a sibling path carrying no version', () => {
    expect(
      concreteDep(
        'kroma-sqlite',
        { workspace: true, optional: true },
        { path: 'crates/kroma-sqlite', version: '0.1.0' },
      ),
    ).toBe('{ path = "../kroma-sqlite", optional = true }');
  });
});

describe('standaloneCargoToml', () => {
  const out = standaloneCargoToml(MEMBER, WORKSPACE);

  it('inlines the package fields the member inherited from the workspace', () => {
    expect(out).toContain('edition = "2021"');
    expect(out).toContain('rust-version = "1.88"');
    expect(out).toContain('license = "MIT"');
    expect(out).not.toContain('.workspace = true');
  });

  it('rewrites every workspace dependency as the spec it stood for', () => {
    expect(out).toContain('kroma-module-manifest = { path = "../kroma-module-manifest" }');
    expect(out).toContain('kroma-sqlite = { path = "../kroma-sqlite", optional = true }');
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
  });

  it('drops the dev-dependencies table whole', () => {
    expect(out).not.toContain('[dev-dependencies]');
  });

  it('drops a crate outside the closure with the feature naming it, and allows the cfg', () => {
    expect(out).not.toContain('kroma-engine');
    expect(out).toContain('storage = ["dep:kroma-sqlite", "kroma-module-host/storage"]');
    expect(out).toContain(
      '[lints.rust]\nunexpected_cfgs = { level = "allow", check-cfg = [\'cfg(feature, values("engine"))\'] }',
    );
  });

  it('keeps a feature that only turned a dropped crate on, minus that entry', () => {
    expect(out).toContain('testing = ["kroma-sqlite/testing", "dep:kroma-testing"]');
  });

  it('takes the comment that introduced a dropped dependency with it', () => {
    expect(out).not.toContain('The whole core, for the two modules');
  });

  it('refuses a dependency the workspace never declared', () => {
    expect(() =>
      standaloneCargoToml('[dependencies]\nmystery = { workspace = true }\n', WORKSPACE),
    ).toThrow(/mystery is not in \[workspace\.dependencies\]/);
  });
});

describe('vendorRust', () => {
  const out = join(ROOT, 'rust');
  const written = vendorRust({ serverDir: SERVER, outDir: out, version: '0.1.40' });

  it('copies the whole closure and stamps the SDK version on every crate', () => {
    expect(written).toEqual([...CLOSURE]);
    for (const crate of CLOSURE) {
      expect(readFileSync(join(out, crate, 'Cargo.toml'), 'utf8')).toContain('version = "0.1.40"');
    }
  });

  it('leaves a cargo workspace whose members are the crates it wrote', () => {
    expect(readFileSync(join(out, 'Cargo.toml'), 'utf8')).toContain(
      `members = [${CLOSURE.map((c) => `"${c}"`).join(', ')}]`,
    );
  });

  it('takes the sources and not the test tree beside them', () => {
    expect(existsSync(join(out, 'kroma-sqlite', 'src', 'lib.rs'))).toBe(true);
    expect(existsSync(join(out, 'kroma-sqlite', 'tests'))).toBe(false);
  });

  it('refuses a closure crate the repository has not got', () => {
    const bare = seedServer(join(ROOT, 'bare'), CLOSURE.slice(1));

    expect(() =>
      vendorRust({ serverDir: bare, outDir: join(ROOT, 'bare-rust'), version: '0.1.40' }),
    ).toThrow(/no crate at .*kroma-module-sdk/);
  });
});
