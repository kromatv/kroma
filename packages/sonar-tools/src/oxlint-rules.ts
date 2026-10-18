import { readFileSync, writeFileSync } from 'node:fs';
import sonarjs from 'eslint-plugin-sonarjs';
import { z } from 'zod';

const API = 'https://sonarcloud.io/api';
const ORGANIZATION = 'kromatv';
const PROJECT = 'kromatv_kroma';
const OUTPUT = '.oxlintrc.sonar.json';
const MAX_BODY = 5_000_000;
const SONAR_RULES = sonarjs.rules ?? {};

const BORROWED: Record<string, string> = {
  S3863: 'import/no-duplicates',
  S6754: 'kroma/use-state-pair',
  S7761: 'unicorn/prefer-dom-node-dataset',
  S7763: 'kroma/re-export-from',
  S7776: 'unicorn/prefer-set-has',
};

type Params = Record<string, string>;

const OPTIONS: Record<string, (params: Params) => unknown[]> = {
  'class-name': (p) => [{ format: p.format }],
  'cognitive-complexity': (p) => [Number(p.threshold)],
  'content-length': (p) => [
    {
      fileUploadSizeLimit: Number(p.fileUploadSizeLimit),
      standardSizeLimit: Number(p.standardSizeLimit),
    },
  ],
  'max-switch-cases': (p) => [Number(p.maximum)],
  'no-hardcoded-passwords': (p) => [{ passwordWords: (p.passwordWords ?? '').split(',') }],
  'no-hardcoded-secrets': (p) => [
    { secretWords: p.secretWords, randomnessSensibility: Number(p.randomnessSensibility) },
  ],
  'no-nested-functions': (p) => [{ threshold: Number(p.max) }],
};

const RuleDocs = z.object({
  url: z.string().optional(),
  requiresTypeChecking: z.boolean().optional(),
});

const Profiles = z.object({
  profiles: z.array(z.object({ name: z.string(), language: z.string() })),
});

const ExportedRule = z.object({
  repository: z.string(),
  key: z.string().regex(/^S\d+$/),
  params: z.record(z.string(), z.string()),
});

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY) throw new Error(`${path}: response over ${MAX_BODY} bytes`);
  return text;
}

function exportedRules(xml: string): z.infer<typeof ExportedRule>[] {
  const tag = (block: string, name: string) =>
    new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1] ?? '';
  return [...xml.matchAll(/<rule>([\s\S]*?)<\/rule>/g)].map(([, block = '']) =>
    ExportedRule.parse({
      repository: tag(block, 'repositoryKey'),
      key: tag(block, 'key'),
      params: Object.fromEntries(
        [...block.matchAll(/<parameter>([\s\S]*?)<\/parameter>/g)].map(([, param = '']) => [
          tag(param, 'key'),
          tag(param, 'value'),
        ]),
      ),
    }),
  );
}

async function activeRules(): Promise<Map<string, Params>> {
  const { profiles } = Profiles.parse(
    JSON.parse(
      await fetchText(`/qualityprofiles/search?organization=${ORGANIZATION}&project=${PROJECT}`),
    ),
  );
  const profile = profiles.find((one) => one.language === 'ts');
  if (!profile) throw new Error('the project has no TypeScript quality profile');
  const xml = await fetchText(
    `/qualityprofiles/export?organization=${ORGANIZATION}&language=ts&qualityProfile=${encodeURIComponent(profile.name)}`,
  );
  const active = new Map<string, Params>();
  for (const rule of exportedRules(xml)) {
    if (rule.repository === 'typescript') active.set(rule.key, rule.params);
  }
  return active;
}

function sonarKey(url: string | undefined): string | null {
  const found = /RSPEC-?(\d+)|\/S(\d+)/i.exec(url ?? '');
  return found ? `S${found[1] ?? found[2]}` : null;
}

function nativeRules(active: Map<string, Params>): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  for (const [name, rule] of Object.entries(SONAR_RULES)) {
    const docs = RuleDocs.parse(rule.meta?.docs ?? {});
    const key = sonarKey(docs.url);
    if (!key || docs.requiresTypeChecking) continue;
    const params = active.get(key);
    if (!params) continue;
    const options = OPTIONS[name];
    if (Object.keys(params).length && !options) {
      throw new Error(`sonarjs/${name} (${key}) takes ${Object.keys(params)}: map them in OPTIONS`);
    }
    rules[`sonarjs/${name}`] = options ? ['error', ...options(params)] : 'error';
  }
  return rules;
}

function properties(text: string): Map<string, string> {
  const joined = text.replaceAll(/\\\r?\n\s*/g, '');
  const values = new Map<string, string>();
  for (const line of joined.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const at = line.indexOf('=');
    if (at > 0) values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return values;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function ignoredPerFile(
  props: Map<string, string>,
  mirrored: Map<string, string>,
): { files: string[]; rules: Record<string, 'off'> }[] {
  const byFile = new Map<string, Record<string, 'off'>>();
  for (const id of list(props.get('sonar.issue.ignore.multicriteria'))) {
    const ruleKey = props.get(`sonar.issue.ignore.multicriteria.${id}.ruleKey`) ?? '';
    const file = props.get(`sonar.issue.ignore.multicriteria.${id}.resourceKey`);
    const [language, key = ''] = ruleKey.split(':');
    const rule = mirrored.get(key);
    if (!file || !rule || !['typescript', 'javascript'].includes(language ?? '')) continue;
    byFile.set(file, { ...byFile.get(file), [rule]: 'off' });
  }
  return [...byFile]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, rules]) => ({ files: [file], rules }));
}

const active = await activeRules();
const native = nativeRules(active);
const borrowed = Object.fromEntries(
  Object.entries(BORROWED)
    .filter(([key]) => active.has(key))
    .map(([, rule]) => [rule, 'error']),
);
const mirrored = new Map<string, string>([
  ...Object.entries(BORROWED),
  ...Object.keys(native).map((rule): [string, string] => {
    const name = rule.slice('sonarjs/'.length);
    return [sonarKey(RuleDocs.parse(SONAR_RULES[name]?.meta?.docs ?? {}).url) ?? '', rule];
  }),
]);
const props = properties(readFileSync('sonar-project.properties', 'utf8'));
const base = z
  .object({ ignorePatterns: z.array(z.string()) })
  .parse(JSON.parse(readFileSync('.oxlintrc.json', 'utf8')));
const ignorePatterns = [
  ...new Set([
    ...base.ignorePatterns,
    ...list(props.get('sonar.test.inclusions')),
    ...list(props.get('sonar.exclusions')).filter((glob) => /\.(m?[jt]sx?)$|\/\*\*$/.test(glob)),
  ]),
];
const config = {
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: ['import', 'unicorn'],
  categories: { correctness: 'off' },
  jsPlugins: [
    { name: 'sonarjs', specifier: 'eslint-plugin-sonarjs' },
    { name: 'kroma', specifier: './packages/lint-rules/src/index.mjs' },
  ],
  rules: Object.fromEntries(
    Object.entries({ ...native, ...borrowed }).sort(([a], [b]) => a.localeCompare(b)),
  ),
  ignorePatterns,
  overrides: ignoredPerFile(props, mirrored),
};
writeFileSync(OUTPUT, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `${OUTPUT}: ${Object.keys(native).length} Sonar rules, ${Object.keys(borrowed).length} borrowed, ${config.overrides.length} per-file ignores`,
);
