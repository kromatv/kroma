const CODE = /^([a-z0-9-]+)\((.+)\)$/;
const GLOB_SIGNS = /[\\[\]{}()*?!]/g;

/** The config name of the rule a diagnostic code names, or null when no rule owns it. */
export function ruleOf(code) {
  const match = CODE.exec(code ?? '');
  return match ? `${match[1]}/${match[2]}` : null;
}

/** How many times each rule fires in each file: `{ rule: { file: count } }`. */
export function tally(diagnostics) {
  const counts = {};
  for (const { code, filename } of diagnostics) {
    const rule = ruleOf(code);
    if (rule && filename) {
      counts[rule] ??= {};
      counts[rule][filename] = (counts[rule][filename] ?? 0) + 1;
    }
  }
  return counts;
}

function pairsOf(counts) {
  return Object.entries(counts).flatMap(([rule, files]) =>
    Object.entries(files).map(([file, count]) => ({ rule, file, count })),
  );
}

/**
 * Where the code and the recorded debt disagree: `worse` exceeds its allowance,
 * `fresh` is a finding the list never held, `better` is an allowance the code
 * no longer needs.
 */
export function compare(recorded, actual) {
  const found = (rule, file) => actual[rule]?.[file] ?? 0;
  const allowed = (rule, file) => recorded[rule]?.[file] ?? 0;
  const listed = pairsOf(recorded).map(({ rule, file, count }) => ({
    rule,
    file,
    allowed: count,
    found: found(rule, file),
  }));
  return {
    worse: listed.filter((pair) => pair.found > pair.allowed),
    better: listed.filter((pair) => pair.found < pair.allowed),
    fresh: pairsOf(actual)
      .filter(({ rule, file }) => allowed(rule, file) === 0)
      .map(({ rule, file, count }) => ({ rule, file, allowed: 0, found: count })),
  };
}

/** The recorded debt lowered to what the code still holds. It never grows. */
export function shrink(recorded, actual) {
  const kept = {};
  for (const { rule, file, count } of pairsOf(recorded)) {
    const remaining = Math.min(count, actual[rule]?.[file] ?? 0);
    if (remaining > 0) {
      kept[rule] ??= {};
      kept[rule][file] = remaining;
    }
  }
  return sorted(kept);
}

/** The same counts with rules and files in a stable order. */
export function sorted(counts) {
  const ordered = {};
  for (const rule of Object.keys(counts).sort()) {
    ordered[rule] = {};
    for (const file of Object.keys(counts[rule]).sort()) {
      ordered[rule][file] = counts[rule][file];
    }
  }
  return ordered;
}

/** One oxlint override per rule, switching it off in the files that still owe it. */
export function overridesOf(recorded) {
  return Object.keys(recorded)
    .sort()
    .map((rule) => ({
      files: Object.keys(recorded[rule])
        .sort()
        .map((file) => file.replace(GLOB_SIGNS, String.raw`\$&`)),
      rules: { [rule]: 'off' },
    }));
}

/** The lines a developer reads when the check fails, most urgent first. */
export function report({ worse, fresh, better }) {
  const line = ({ rule, file, allowed, found }) => `  ${file}: ${rule} ${allowed} -> ${found}`;
  const section = (title, pairs) => (pairs.length ? [title, ...pairs.map(line), ''] : []);
  return [
    ...section('Worse than the recorded debt. Fix the new findings:', worse),
    ...section('New findings in files that owed nothing. Fix them:', fresh),
    ...section('Fixed. Record it with `bun run lint:debt --update`:', better),
  ].join('\n');
}
