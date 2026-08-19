---
name: sonar-loop
description: Drive a PR to a green quality gate and keep it there. Loops on SonarCloud for the project's targets, no new issues, no duplication on new code, and coverage on new logic as close to 100% as the code allows, then watches the PR checks until every one passes. Use when a quality gate blocks a merge, when coverage or duplication has to come up, or before asking for review. Triggers - "fix the sonar issues", "quality gate", "get coverage up", "zero duplication", "loop until CI is green", "watch the checks".
---

# Sonar loop

The targets are the project's, not this skill's. Find them before deciding
anything, in the conventions doc or the contributing guide, and treat them as part
of done rather than as a follow-up. A common bar, and a good default when a project
states none: **0 new issues, 0% duplication on new code, near-total coverage on
new logic**.

Read `sonar-project.properties` before calling anything a false positive. It holds
the scanner's scope, the coverage denominator, and every reviewed suppression. A
project with no such file is not scanned by Sonar, so skip to the checks loop and
use whatever gate its CI runs.

## Run the gate locally first

Cheaper than a round trip through CI, and it catches most of it. Read the
manifest scripts for the project's wrappers; the ones that matter are a
changed-files precheck, the formatter and linter, and the coverage run:

```bash
<precheck script>     # the changed files, against the rules that usually fire
<lint script>         # formatter and linter
<coverage script>     # writes lcov for the scanner
```

Note where each coverage report lands. Per-language reports go in different
places and the scanner needs every path listed in its properties file, so a new
language in the repo means a new entry there.

## Getting a token

Everything below needs `SONAR_TOKEN`. In CI it is a repository secret. Locally it
is not set, and the first `curl` fails with nothing useful printed, so check
before looping:

```bash
[ -n "$SONAR_TOKEN" ] || echo 'no SONAR_TOKEN: generate one under My Account > Security on sonarcloud.io'
```

Without a token, read the gate through the PR's own check output
(`gh pr checks`, `gh run view --log`) instead. That is slower but needs no
credential, and it is the right path in an unattended run.

## The loop

1. Read the current state. Measures first, so you fix the thing that is actually
   failing:

```bash
PR=<number>
KEY=$(grep sonar.projectKey sonar-project.properties | cut -d= -f2 | tr -d ' ')
curl -fsSL -u "${SONAR_TOKEN}:" \
  "https://sonarcloud.io/api/measures/component?component=${KEY}&pullRequest=${PR}&metricKeys=new_violations,new_coverage,new_duplicated_lines_density,new_security_hotspots" \
  | jq -r '.component.measures[] | "\(.metric)=\(.period.value // .value)"'
```

   The quality-gate endpoint carries numbers the measures endpoint returns as
   null, so fall back to
   `/api/qualitygates/project_status?pullRequest=${PR}&projectKey=${KEY}`
   when a value is missing.

2. Take the offenders one at a time, worst first. One cause per commit.
3. Push, then wait for the rescan rather than guessing:

```bash
gh pr checks $PR --watch --fail-fast
```

4. Re-read the measures. The check set can change between runs, so re-read it
   rather than assuming the previous list still holds.
5. Stop when every target is met and every check is green.

## Fixing, in order of preference

**Coverage.** Untested new logic is the usual gap, and the usual cause is logic
that landed somewhere a test cannot reach. Move it rather than excluding it: new
logic goes where a test can call it. Use the project's test skills to write the
test, and **tdd** when the code is not written yet.

Two traps that make a local number lie. A coverage tool that instruments only what
the tests loaded reads far higher than Sonar, which counts every file in scope, so
a file no test imports is invisible locally and a zero in the gate. And a branch
the runner cannot take, a `require()` fallback or a build-time environment check,
is covered on paper by a test that asserts nothing.

**Duplication.** Extract the shared thing into a real home and have both callers
reach it by name. Copying a block and renaming a variable is what put it there.

**Issues.** Prefer a code fix over a suppression, every time. When a rule is
genuinely wrong for a line, the entry goes in `sonar-project.properties` where a
reviewer sees it, with the reason. Never an inline `NOSONAR`.

## Failures that are not yours

If a check fails for a reason the PR did not cause and the default branch is
green, merge the default branch in rather than bloating the PR with an unrelated
fix. If a check is flaky, retry once and say so with the evidence. Never bypass
the hooks or force a merge.

## Report

Current numbers against each target, what was fixed and why, anything suppressed
and the reason, and the PR URL once it is green.
