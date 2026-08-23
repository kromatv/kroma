import type { Readable, Writable } from 'node:stream';
import { styleText } from 'node:util';
import { isCancel, MultiSelectPrompt } from '@clack/core';
import {
  formatInstructionFooter,
  limitOptions,
  S_BAR,
  S_CHECKBOX_ACTIVE,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  symbol,
} from '@clack/prompts';

export interface LiveOption<TValue> {
  value: TValue;
  label: string;
  hint?: string;
  disabled?: boolean;
  ticked?: boolean;
}

export interface LiveMultiselect<TValue> {
  upsert(option: LiveOption<TValue>): void;
  status(line: string): void;
  notice(line: string): void;
  answer: Promise<TValue[] | null>;
}

export interface LiveMultiselectOptions {
  message: string;
  status: string;
  input?: Readable;
  output?: Writable;
}

const BAR_COLUMNS = 3;
const KEYS = [
  `${dim('↑/↓')} moves`,
  `${dim('space')} ticks`,
  `${dim('enter')} installs`,
  `${dim('ctrl-c')} quits`,
].join(', ');

/** Enter answers with whatever is ticked, empty list included, and ctrl-c with null. */
export function liveMultiselect<TValue>({
  message,
  status,
  input,
  output,
}: LiveMultiselectOptions): LiveMultiselect<TValue> {
  const options: LiveOption<TValue>[] = [];
  let statusLine = status;
  let noticeLine = '';

  const prompt = new GrowingMultiSelect<TValue>({
    options,
    input,
    output,
    render() {
      const head = `${styleText('gray', S_BAR)}\n${symbol(this.state)}  ${message}\n`;
      const ticked = this.value ?? [];
      if (this.state === 'submit' || this.state === 'cancel') {
        return `${head}${styleText('gray', S_BAR)}  ${recap(this.options, ticked, this.state)}`;
      }

      const bar = `${styleText('cyan', S_BAR)}  `;
      const under = noticeLine ? [`${bar}${dim(noticeLine)}`] : [];
      const keys = formatInstructionFooter([statusLine, KEYS], true);
      const rows = limitOptions({
        options: this.options,
        cursor: this.cursor,
        output,
        columnPadding: BAR_COLUMNS,
        rowPadding: head.split('\n').length + under.length + keys.length + 1,
        style: (option, active) => row(option, active, ticked.includes(option.value)),
      });
      const body = rows.join(`\n${bar}`);
      return `${head}${bar}${body}\n${[...under, ...keys].join('\n')}\n`;
    },
  });

  // clack toggles whatever the cursor sits on, and the cursor has nowhere to go
  // when every row is disabled, so a row that takes no app is dropped here.
  const tickable = (value: TValue) =>
    options.find((option) => option.value === value)?.disabled !== true;
  const answer = prompt
    .prompt()
    .then((value) => (isCancel(value) ? null : (value ?? []).filter(tickable)));

  return {
    upsert(option) {
      const known = options.findIndex((candidate) => candidate.value === option.value);
      if (known >= 0) {
        options[known] = option;
      } else {
        options.push(option);
        if (option.ticked) prompt.value = [...(prompt.value ?? []), option.value];
      }
      if (options[prompt.cursor]?.disabled) prompt.cursor = firstTickable(options);
      prompt.redraw();
    },
    status(line) {
      statusLine = line;
      prompt.redraw();
    },
    notice(line) {
      noticeLine = line;
      prompt.redraw();
    },
    answer,
  };
}

class GrowingMultiSelect<TValue> extends MultiSelectPrompt<LiveOption<TValue>> {
  redraw(): void {
    this.output.emit('resize');
  }
}

function firstTickable<TValue>(options: readonly LiveOption<TValue>[]): number {
  return Math.max(
    options.findIndex((option) => option.disabled !== true),
    0,
  );
}

function row<TValue>(option: LiveOption<TValue>, active: boolean, ticked: boolean): string {
  const note = option.hint ? `(${option.hint})` : '';
  const hint = note ? ` ${dim(note)}` : '';
  if (option.disabled) {
    const label = styleText(['strikethrough', 'gray'], option.label);
    return `${styleText('gray', S_CHECKBOX_INACTIVE)} ${label}${hint}`;
  }
  if (ticked) {
    const label = active ? option.label : dim(option.label);
    return `${styleText('green', S_CHECKBOX_SELECTED)} ${label}${hint}`;
  }
  if (active) return `${styleText('cyan', S_CHECKBOX_ACTIVE)} ${option.label}${hint}`;
  return `${dim(S_CHECKBOX_INACTIVE)} ${dim(option.label)}${hint}`;
}

function recap<TValue>(
  options: readonly LiveOption<TValue>[],
  ticked: readonly TValue[],
  state: 'submit' | 'cancel',
): string {
  const chosen = options.filter((option) => ticked.includes(option.value));
  if (state === 'cancel') return chosen.map((option) => struck(option.label)).join(dim(', '));
  if (chosen.length === 0) return dim('none');
  return chosen.map((option) => dim(option.label)).join(dim(', '));
}

function dim(text: string): string {
  return styleText('dim', text);
}

function struck(text: string): string {
  return styleText(['strikethrough', 'dim'], text);
}
