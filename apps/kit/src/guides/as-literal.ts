const WIDTH = 72;
const STEP = '  ';
const JOINT = 5;
const SHORTEST = 24;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

interface Place {
  indent: string;
  lead: number;
}

interface Entry {
  label: string;
  value: unknown;
}

function quoted(text: string): string {
  const escaped = text
    .replaceAll('\\', '\\\\')
    .replaceAll("'", String.raw`\'`)
    .replaceAll('\n', String.raw`\n`);
  return `'${escaped}'`;
}

function labelOf(key: string): string {
  const name = IDENTIFIER.test(key) ? key : quoted(key);
  return `${name}: `;
}

function entriesOf(value: object): Entry[] {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => ({ label: '', value: item }));
  }
  return Object.entries(value)
    .filter(([, item]: [string, unknown]) => item !== undefined)
    .map(([key, item]: [string, unknown]) => ({ label: labelOf(key), value: item }));
}

function flat(value: unknown): string {
  if (typeof value === 'string') {
    return quoted(value);
  }
  if (typeof value !== 'object' || value === null) {
    return String(value);
  }
  const inner = entriesOf(value)
    .map((entry) => entry.label + flat(entry.value))
    .join(', ');
  if (Array.isArray(value)) {
    return `[${inner}]`;
  }
  return inner ? `{ ${inner} }` : '{}';
}

function chunks(text: string, room: number): string[] {
  const words = text.split(' ').map((word, at, all) => (at < all.length - 1 ? `${word} ` : word));
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length > room) {
      lines.push(line);
      line = '';
    }
    line += word;
  }
  return [...lines, line];
}

function laidText(text: string, { indent, lead }: Place): string {
  const hanging = indent + STEP;
  const room = WIDTH - Math.max(lead, hanging.length) - JOINT;
  return chunks(text, Math.max(room, SHORTEST))
    .map((part) => quoted(part))
    .join(` +\n${hanging}`);
}

function laid(value: unknown, place: Place): string {
  const line = flat(value);
  if (place.lead + line.length < WIDTH) {
    return line;
  }
  if (typeof value === 'string') {
    return laidText(value, place);
  }
  if (typeof value !== 'object' || value === null) {
    return line;
  }
  const indent = place.indent + STEP;
  const rows = entriesOf(value).map((entry) => {
    const body = laid(entry.value, { indent, lead: indent.length + entry.label.length });
    return `${indent}${entry.label}${body},`;
  });
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return [open, ...rows, `${place.indent}${close}`].join('\n');
}

/** `value` as the JavaScript literal a console prints: on one line when it
 * fits in 72 columns, one entry to a line when it does not, and a string too
 * long for its line broken between two words. */
function asLiteral(value: unknown): string {
  return laid(value, { indent: '', lead: 0 });
}

export { asLiteral };
