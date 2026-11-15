import { parseArgs } from 'node:util';
import { type Context, primary } from './commands.ts';
import { writeNote } from './notes.ts';
import { localesOf } from './set.ts';
import { translate, type Translator } from './translate.ts';

/** `translate <locale> [prefix...]`: fill what a language lacks through a
 *  translator, Claude Code unless a test hands another. */
export async function translateCommand(
  context: Context,
  args: string[],
  translator?: Translator,
): Promise<number> {
  const { sets, print } = context;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      set: { type: 'string' },
      limit: { type: 'string' },
      batch: { type: 'string' },
      model: { type: 'string' },
    },
  });
  const [locale, ...prefixes] = positionals;
  if (locale === undefined) {
    throw new Error(`usage: ${context.bin} translate <locale> [prefix...]`);
  }
  if (!sets.some((set) => localesOf(set).includes(locale))) {
    throw new Error(`no language "${locale}" here: start it with \`${context.bin} add ${locale}\``);
  }
  const ask = translator ?? (await import('./claude-code.ts')).claudeCodeTranslator(values.model);
  const reference = primary(sets).project.fallback;
  let refusals = 0;
  for (const set of sets) {
    if ((values.set !== undefined && set.name !== values.set) || locale === set.project.source) {
      continue;
    }
    const done = await translate(set, locale, ask, {
      reference,
      prefixes,
      limit: values.limit === undefined ? undefined : Number(values.limit),
      batch: values.batch === undefined ? undefined : Number(values.batch),
      onBatch: (written, total) => print(`${set.name}  ${locale}: ${written} of ${total}`),
    });
    if (done.asked === 0) {
      continue;
    }
    for (const { key, why } of done.refused) {
      print(`${set.name}  ${locale}: ${key} ${why}, left out`);
    }
    refusals += done.refused.length;
  }
  print(`Read them, then: ${context.bin} confirm ${locale}`);
  return refusals === 0 ? 0 : 1;
}

/** `note <key|prefix.|*> "<text>"`: tell translators about a message. */
export function noteCommand(context: Context, args: string[]): number {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const [about, text] = positionals;
  if (about === undefined || text === undefined) {
    throw new Error(`usage: ${context.bin} note <key | prefix. | *> "<text>"`);
  }
  writeNote(primary(context.sets), about, text);
  context.print(text === '' ? `Note on ${about} removed.` : `Note on ${about} written.`);
  return 0;
}
