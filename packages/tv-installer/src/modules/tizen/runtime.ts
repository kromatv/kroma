import type { Runtime } from '../../television';

const TIZEN_BY_MODEL_YEAR: Readonly<Record<number, { version: string; chromium: string }>> = {
  2017: { version: '3.0', chromium: '47' },
  2018: { version: '4.0', chromium: '56' },
  2019: { version: '5.0', chromium: '63' },
  2020: { version: '5.5', chromium: '69' },
  2021: { version: '6.0', chromium: '76' },
  2022: { version: '6.5', chromium: '85' },
  2023: { version: '7.0', chromium: '94' },
  2024: { version: '8.0', chromium: '108' },
  2025: { version: '9.0', chromium: '120' },
};

/**
 * What a Samsung runs, from the model year `device.model` opens with:
 * `24_PTM_FTV_T09` is a 2024 set. The table holds what
 * `clients/tizen/tv.target.ts` states; a year it does not carry answers null.
 */
export function tizenRuntime(model: string | undefined): Runtime | null {
  const year = /^(\d{2})_/.exec(model ?? '')?.[1];
  const dated = year === undefined ? undefined : TIZEN_BY_MODEL_YEAR[2000 + Number(year)];
  if (!dated) return null;
  return {
    name: 'Tizen',
    version: dated.version,
    engine: { name: 'Chromium', version: dated.chromium },
    learned: 'derived',
  };
}
