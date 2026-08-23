import type { Runtime } from '../../television';

const WEBOS_BY_MODEL_YEAR: Readonly<Record<number, { version: string; chromium: string }>> = {
  2018: { version: '4.0', chromium: '53' },
  2019: { version: '4.5', chromium: '53' },
  2020: { version: '5.0', chromium: '68' },
  2021: { version: '6.0', chromium: '79' },
  2022: { version: '22', chromium: '87' },
  2023: { version: '23', chromium: '94' },
  2024: { version: '24', chromium: '108' },
  2025: { version: '25', chromium: '120' },
};

const OLED_YEAR: Readonly<Record<string, number>> = {
  '8': 2018,
  '9': 2019,
  X: 2020,
  '1': 2021,
  '2': 2022,
  '3': 2023,
  '4': 2024,
  '5': 2025,
};

const LCD_YEAR: Readonly<Record<string, number>> = {
  LK: 2018,
  SK: 2018,
  UK: 2018,
  LM: 2019,
  SM: 2019,
  UM: 2019,
  UN: 2020,
  UP: 2021,
  UQ: 2022,
  UR: 2023,
  UT: 2024,
  UA: 2025,
};

/**
 * What an LG runs, from the year its model names: `OLED55C16LA` is a 2021 set,
 * `55UR78006LK` a 2023 one. The names are tried in turn, because a set that
 * calls its `modelName` "LG TV" carries the real one in `modelNumber`. The
 * table holds what `clients/webos/README.md` states; a name it cannot date
 * answers null.
 */
export function webosRuntime(models: readonly (string | undefined)[]): Runtime | null {
  for (const model of models) {
    const year = modelYear(model ?? '');
    const dated = year === null ? undefined : WEBOS_BY_MODEL_YEAR[year];
    if (dated) {
      return {
        name: 'webOS',
        version: dated.version,
        engine: { name: 'Chromium', version: dated.chromium },
        learned: 'derived',
      };
    }
  }
  return null;
}

function modelYear(model: string): number | null {
  const upper = model.toUpperCase();
  const oled = /OLED\d{2}[A-Z]([0-9X])/.exec(upper)?.[1];
  if (oled !== undefined) return OLED_YEAR[oled] ?? null;
  const lcd = /\d{2}([A-Z]{2})\d/.exec(upper)?.[1];
  return lcd === undefined ? null : (LCD_YEAR[lcd] ?? null);
}
