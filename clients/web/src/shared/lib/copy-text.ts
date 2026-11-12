function copyThroughSelection(text: string): boolean {
  const focused = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  if (focused instanceof HTMLElement) focused.focus();
  return copied;
}

/** Copies `text`, falling back to the selection where the Clipboard API is
 *  missing or refuses: a page served over plain http, which is how most
 *  servers are reached on a LAN. Resolves to whether the copy happened. */
export function copyText(text: string): Promise<boolean> {
  const board = globalThis.navigator?.clipboard;
  if (!board) return Promise.resolve(copyThroughSelection(text));
  return board.writeText(text).then(
    () => true,
    () => copyThroughSelection(text),
  );
}
