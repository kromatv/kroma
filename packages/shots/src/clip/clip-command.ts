import { signInAccount, signInFrom, signOut, speak } from './account';
import { catalogMessages, keyFinder } from './catalog';
import { productLanguages } from './languages';
import { parseOptions } from './options';
import { type Clip, collapse, type Finding, type Keyed, reportLines, type Unread } from './report';
import { sweep } from './sweep';
import { librarySamples, tvScreens } from './tv-screens';
import { webRoutes } from './web-routes';

type Catalogs = { repoDir: string; languages: readonly string[]; source: string };

type Printed = {
  findings: readonly Finding[];
  unread: readonly Unread[];
  languages: string[];
  json: boolean;
};

function keyed(clips: readonly Clip[], { repoDir, languages, source }: Catalogs): Keyed[] {
  const finders = new Map(
    languages.map((language) => {
      const chain = [...new Set([language, source])];
      return [language, keyFinder(catalogMessages(repoDir, chain))] as const;
    }),
  );
  return clips.map((clip) => ({ ...clip, key: finders.get(clip.language)?.(clip.text) ?? null }));
}

function printed({ findings, unread, languages, json }: Printed): string[] {
  return json
    ? [JSON.stringify({ findings, unread }, null, 2)]
    : reportLines(findings, unread, languages);
}

/** Runs `bun run shots:clip` from `repoDir`: signs in, sweeps, prints what it
 *  found to stdout, and puts the account's language back. Answers the exit
 *  code: 1 while a text is clipped or a screen could not be read. */
export async function clipCommand(
  repoDir: string,
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const options = parseOptions(argv);
  const [source, ...offered] = productLanguages(repoDir);
  const languages = options.languages ?? [source, ...offered];
  const account = await signInAccount(options.server, signInFrom(env, options.seed));
  try {
    const screens = tvScreens(await librarySamples(account));
    const plan = { ...options, languages, account, routes: webRoutes(repoDir), screens };
    const found = await sweep(plan);
    const all = collapse(keyed(found.clips, { repoDir, languages, source }));
    const findings = options.catalogOnly ? all.filter((finding) => finding.key !== null) : all;
    for (const line of printed({ findings, unread: found.unread, languages, json: options.json })) {
      console.log(line);
    }
    return findings.length + found.unread.length === 0 || options.report ? 0 : 1;
  } finally {
    await speak(account, account.user.language ?? null);
    await signOut(account);
  }
}
