const CSI = '\x1b[';
const enabled = process.stdout.isTTY === true && !process.env.NO_COLOR;

const wrap = (code: string) => (text: string) => (enabled ? `${CSI}${code}m${text}${CSI}0m` : text);

export const style = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
};
