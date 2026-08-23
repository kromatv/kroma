type Resolvable<T> = T | (() => T | Promise<T>) | Promise<T>;

export interface UsageArg {
  type?: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  valueHint?: string;
}

/** The shape of a citty command, structurally, so the renderer owns no framework. */
export interface UsageCommand {
  meta?: Resolvable<{ name?: string; description?: string }>;
  args?: Resolvable<Record<string, UsageArg>>;
  subCommands?: Resolvable<Record<string, Resolvable<UsageCommand>>>;
}

const START = '<!-- usage:start -->';
const END = '<!-- usage:end -->';

/** The commands and options of a CLI, as the markdown table its README carries. */
export async function renderUsage(root: UsageCommand, invocation: string): Promise<string> {
  const meta = await resolve(root.meta);
  const rows = [row(invocation, meta?.description)];
  for (const [name, sub] of Object.entries((await resolve(root.subCommands)) ?? {})) {
    const command = await resolve(sub);
    const subMeta = await resolve(command.meta);
    rows.push(row(`${invocation} ${name}${await positionals(command)}`, subMeta?.description));
  }

  const options = optionRows((await resolve(root.args)) ?? {});
  return [
    '| command | what it does |',
    '| --- | --- |',
    ...rows,
    '',
    '| option | what it does |',
    '| --- | --- |',
    ...options,
  ].join('\n');
}

/** Replaces the block between the usage markers, which the file must already carry. */
export function injectUsage(markdown: string, block: string): string {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no ${START} ... ${END} block to write into`);
  }
  return `${markdown.slice(0, start + START.length)}\n\n${block}\n\n${markdown.slice(end)}`;
}

function optionRows(args: Record<string, UsageArg>): string[] {
  return Object.entries(args)
    .filter(([, arg]) => arg.type !== 'positional')
    .map(([name, arg]) => row(flagCell(name, arg), arg.description, false));
}

function flagCell(name: string, arg: UsageArg): string {
  if (arg.type !== 'boolean') return `\`--${name} <${arg.valueHint ?? 'value'}>\``;
  return arg.default === true ? `\`--${name}\`, \`--no-${name}\`` : `\`--${name}\``;
}

async function positionals(command: UsageCommand): Promise<string> {
  return Object.entries((await resolve(command.args)) ?? {})
    .filter(([, arg]) => arg.type === 'positional')
    .map(([name, arg]) => (arg.required === false ? ` [${name}]` : ` <${name}>`))
    .join('');
}

function row(label: string, description: string | undefined, code = true): string {
  const cell = code ? `\`${label}\`` : label;
  return `| ${cell} | ${description ?? ''} |`;
}

async function resolve<T>(value: Resolvable<T>): Promise<T> {
  return typeof value === 'function' ? await (value as () => T | Promise<T>)() : await value;
}
