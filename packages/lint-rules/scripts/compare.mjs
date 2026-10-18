import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const rounds = Number(option('--rounds', '5'));
if (!Number.isInteger(rounds) || rounds < 1)
  throw new Error('--rounds must be a positive integer.');
const output = option('--output', join(root, '.oxc-comparison.json'));
const biome = JSON.parse(readFileSync('biome.json', 'utf8'));
const config = JSON.parse(readFileSync('.oxlintrc.json', 'utf8'));
const excluded = biome.files.includes
  .filter((pattern) => pattern.startsWith('!'))
  .map((pattern) => {
    const glob = pattern.slice(1);
    return [new Bun.Glob(glob), new Bun.Glob(`${glob}/**`)];
  });
const tracked = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root });
if (tracked.exitCode !== 0) throw new Error(tracked.stderr.toString());
const files = tracked.stdout
  .toString()
  .split('\0')
  .filter(
    (path) =>
      path &&
      !['docs/tooling/oxc-results.json', 'docs/tooling/oxc-findings.json'].includes(path) &&
      resolve(path) !== resolve(output) &&
      !excluded.some((globs) => globs.some((glob) => glob.match(path))),
  );
const lintFiles = files.filter((path) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path));
const formatFiles = files.filter((path) => /\.(?:[cm]?[jt]s|[jt]sx|jsonc?|css)$/.test(path));
const native = {
  ...config,
  jsPlugins: [],
  overrides: config.overrides.map((override) => ({
    ...override,
    rules: Object.fromEntries(
      Object.entries(override.rules).filter(([name]) => !name.startsWith('kroma/')),
    ),
  })),
  rules: Object.fromEntries(
    Object.entries(config.rules).filter(([name]) => !name.startsWith('kroma/')),
  ),
};
const nativePath = join(root, `.oxlintrc.native-${process.pid}.json`);
writeFileSync(nativePath, JSON.stringify(native), { flag: 'wx' });
const tasks = [
  {
    name: 'biome-lint',
    cmd: ['biome', 'lint', '--reporter=json', '--max-diagnostics=none'],
    files: lintFiles,
  },
  {
    name: 'oxlint-native',
    cmd: ['oxlint', '-c', nativePath, '--ignore-path', '.gitignore', '--format', 'json'],
    files: lintFiles,
  },
  {
    name: 'oxlint-custom',
    cmd: ['oxlint', '--ignore-path', '.gitignore', '--format', 'json'],
    files: lintFiles,
  },
  {
    name: 'biome-format',
    cmd: ['biome', 'format', '--reporter=json', '--max-diagnostics=none'],
    files: formatFiles,
  },
  { name: 'oxfmt-format', cmd: ['oxfmt', '--list-different'], files: formatFiles },
];
function run(task) {
  const command = [
    join(root, 'node_modules/.bin', task.cmd[0]),
    ...task.cmd.slice(1),
    ...task.files,
  ];
  const start = performance.now();
  const result = Bun.spawnSync(command, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  const milliseconds = performance.now() - start;
  if (result.error || result.signalCode || ![0, 1].includes(result.exitCode)) {
    throw new Error(
      `${task.name} failed: ${result.error ?? result.signalCode ?? result.stderr.toString()}`,
    );
  }
  const stdout = result.stdout.toString();
  let diagnostics;
  if (task.name === 'oxfmt-format') {
    const different = stdout.trim().split('\n').filter(Boolean);
    if (result.stderr.length) throw new Error(`${task.name}: ${result.stderr.toString()}`);
    diagnostics = { filesNeedingFormat: different.length, examples: different.slice(0, 10) };
  } else {
    const report = JSON.parse(stdout);
    if (!Array.isArray(report.diagnostics))
      throw new Error(`${task.name}: invalid report: ${stdout.slice(0, 500)}`);
    const counts = {};
    for (const diagnostic of report.diagnostics) {
      const name = diagnostic.category ?? diagnostic.code ?? 'unknown';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    diagnostics = {
      total: report.diagnostics.length,
      summary: report.summary,
      files: report.number_of_files,
      rules: report.number_of_rules,
      byRule: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])),
    };
  }
  return { milliseconds, exitCode: result.exitCode, diagnostics };
}
try {
  for (const task of tasks) {
    console.error(`Warmup: ${task.name} (${task.files.length} files)`);
    task.baseline = run(task);
    task.samples = [];
  }
  for (let round = 0; round < rounds; round++) {
    const rotated = [...tasks.slice(round % tasks.length), ...tasks.slice(0, round % tasks.length)];
    for (const task of rotated) task.samples.push(run(task).milliseconds);
    console.error(`Completed round ${round + 1}/${rounds}`);
  }
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const corpusHash = (paths) =>
    hash(paths.map((path) => `${path}\0${hash(readFileSync(path))}`).join('\n'));
  const report = {
    createdAt: new Date().toISOString(),
    revision: Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(),
    host: { platform: platform(), release: release(), cpu: cpus()[0].model, cores: cpus().length },
    runtime: {
      bun: Bun.version,
      node: Bun.spawnSync(['node', '--version']).stdout.toString().trim(),
    },
    versions: Object.fromEntries(
      ['@biomejs/biome', 'oxlint', 'oxfmt'].map((name) => [
        name,
        JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version,
      ]),
    ),
    method:
      'Tracked files only, excluding generated evaluation snapshots and current Biome exclusions, identical file lists per operation; JS/TS lint; JS/TS/JSON/JSONC/CSS format. One warmup per tool, interleaved sequential rounds, wall time including CLI startup and reporting. Different rule sets, not parity. Existing failures retained. No fixes applied.',
    configHashes: Object.fromEntries(
      ['biome.json', '.oxlintrc.json', '.oxfmtrc.json'].map((path) => [
        path,
        hash(readFileSync(path)),
      ]),
    ),
    pluginHashes: Object.fromEntries(
      [...new Bun.Glob('packages/lint-rules/src/**/*.mjs').scanSync({ cwd: root })]
        .filter((path) => !path.endsWith('.test.mjs'))
        .sort((left, right) => left.localeCompare(right))
        .map((path) => [path, hash(readFileSync(path))]),
    ),
    corpus: {
      lint: { count: lintFiles.length, sha256: corpusHash(lintFiles) },
      format: { count: formatFiles.length, sha256: corpusHash(formatFiles) },
    },
    results: tasks.map((task) => {
      const sorted = [...task.samples].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const medianMs =
        sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      return {
        name: task.name,
        medianMs,
        samplesMs: task.samples,
        exitCode: task.baseline.exitCode,
        diagnostics: task.baseline.diagnostics,
      };
    }),
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.table(
    report.results.map(({ name, medianMs, exitCode }) => ({
      name,
      medianMs: Math.round(medianMs),
      exitCode,
    })),
  );
  console.log(`Full results: ${output}`);
} finally {
  rmSync(nativePath, { force: true });
}
