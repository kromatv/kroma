import { describe, expect, it } from 'vitest';
import { type LiveMultiselect, liveMultiselect } from './live-multiselect';
import { KEY, type Terminal, terminal, within } from './terminal.fixture';

function open(tty: Terminal): LiveMultiselect<string> {
  return liveMultiselect<string>({
    message: 'which sets get KROMA',
    status: 'scanning · no television yet',
    input: tty.input,
    output: tty.output,
  });
}

describe('liveMultiselect', () => {
  it('lists an option pushed after the prompt was opened', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon', hint: 'ready' });
    await tty.settle();
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine' });
    await tty.press(KEY.enter);

    expect(tty.drawn()).toContain('Salon');
    expect(tty.drawn()).toContain('Cuisine');
    await expect(within(picker.answer)).resolves.toEqual([]);
  });

  it('leaves the cursor on the row it was on when another option arrives', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine' });
    await tty.press(KEY.down);
    picker.upsert({ value: '10.0.0.3', label: 'Chambre' });
    await tty.press(KEY.space, KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.2']);
  });

  it('steps over a disabled row and lands on the one after it', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine', hint: 'takes no app', disabled: true });
    picker.upsert({ value: '10.0.0.3', label: 'Chambre' });
    await tty.press(KEY.down, KEY.space, KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.3']);
  });

  it('moves the cursor off a disabled row as soon as a tickable one arrives', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon', disabled: true });
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine' });
    await tty.press(KEY.space, KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.2']);
  });

  it('answers with every value ticked before enter', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine' });
    picker.upsert({ value: '10.0.0.3', label: 'Chambre' });
    await tty.press(KEY.space, KEY.down, KEY.down, KEY.space, KEY.up, KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.1', '10.0.0.3']);
  });

  it('ticks an option that arrives ready', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon', hint: 'ready', ticked: true });
    picker.upsert({ value: '10.0.0.2', label: 'Cuisine' });
    await tty.press(KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.1']);
  });

  it('names what it is installing onto once enter is pressed', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon', ticked: true });
    await tty.press(KEY.enter);
    await within(picker.answer);

    expect(tty.drawn()).toContain('Salon');
  });

  it('says none when enter comes with nothing ticked', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    await tty.press(KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual([]);
    expect(tty.drawn()).toContain('none');
  });

  it('answers null when ctrl-c quits it', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    await tty.press(KEY.space, KEY.cancel);

    await expect(within(picker.answer)).resolves.toBeNull();
    expect(tty.drawn()).toContain('Salon');
  });

  it('redraws the status line the caller sets', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    picker.status('scanning 60% · 1 television');
    await tty.press(KEY.enter);
    await within(picker.answer);

    expect(tty.drawn()).toContain('scanning 60% · 1 television');
  });

  it('draws the notice under the list', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon' });
    picker.notice('a set that has not answered by now is off');
    await tty.press(KEY.enter);
    await within(picker.answer);

    expect(tty.drawn()).toContain('a set that has not answered by now is off');
  });

  it('replaces a row that arrives again under the same host', async () => {
    const tty = terminal();

    const picker = open(tty);
    picker.upsert({ value: '10.0.0.1', label: 'Salon', hint: 'not ready', ticked: true });
    await tty.settle();
    picker.upsert({ value: '10.0.0.1', label: 'Salon', hint: 'ready', ticked: true });
    await tty.press(KEY.enter);

    await expect(within(picker.answer)).resolves.toEqual(['10.0.0.1']);
    expect(tty.drawn()).toContain('ready');
  });
});
