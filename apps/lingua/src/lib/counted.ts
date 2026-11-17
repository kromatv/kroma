/** `count` and a regular English noun agreeing with it: `1 change`, `3 changes`. */
export function counted(count: number, noun: string): string {
  const word = count === 1 ? noun : noun + 's';
  return `${count} ${word}`;
}
