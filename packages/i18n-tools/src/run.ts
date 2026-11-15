import {
  add,
  type Context,
  check,
  confirmCommand,
  fillCommand,
  moveCommand,
  pruneCommand,
  status,
  sync,
  todoCommand,
  types,
} from './commands.ts';
import { newCommand, removeCommand, renameCommand, unusedCommand } from './key-commands.ts';
import { noteCommand, translateCommand } from './translate-command.ts';

type Command = (context: Context, args: string[]) => number | Promise<number>;

const COMMANDS: Record<string, Command> = {
  status,
  check,
  sync,
  types,
  add,
  todo: todoCommand,
  fill: fillCommand,
  confirm: confirmCommand,
  prune: pruneCommand,
  mv: moveCommand,
  new: newCommand,
  rename: renameCommand,
  rm: removeCommand,
  unused: unusedCommand,
  translate: translateCommand,
  note: noteCommand,
};

/** What the commands are, for a CLI that names itself `bin`. */
export function usage(bin: string): string {
  return `usage: ${bin} <command>

  new <key> "<text>" [en="..."]
                             write a message in the source language, and in
                             any other given as <locale>=<text>     --file, --set
  rename <key> <new-key>     in every language, and in the code that names it
  rm <key...>                delete messages from every language
  unused                     messages no source file names           --json

  status [locale]            how far every language has come, or one in detail
                             --json, --md, --all
  check                      what the catalogs get wrong; fails on anything
  sync                       mirror the source's files, update locks and types
  add <locale>               start a language                    --name <endonym>
  todo <locale> [prefix...]  what is left to translate, as JSON  --set, --out,
                                                                 --limit
  fill <locale> <file>       write translations back from JSON   --machine marks
                             them unreviewed
  translate <locale> [prefix...]
                             fill what is left through Claude Code, on the
                             login the \`claude\` command has    --set, --limit,
                                                                 --batch, --model
  note <key|prefix.|*> "<text>"
                             tell translators about a message
  confirm <locale> [prefix]  translations hold as they read: the outdated ones
                             and the ones a machine wrote
  prune [locale]             remove keys the source language no longer has
  mv <key-prefix> <file>     split a namespace: move messages into a file
  types                      write the key types`;
}

/** Run one command, `status` when none is named. Returns the exit code, and
 *  throws what the command could not do. */
export async function run(argv: readonly string[], context: Context): Promise<number> {
  const [name = 'status', ...rest] = argv;
  if (name === 'help' || name === '--help') {
    context.print(usage(context.bin));
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    throw new Error(`unknown command '${name}'\n\n${usage(context.bin)}`);
  }
  return command(context, rest);
}
