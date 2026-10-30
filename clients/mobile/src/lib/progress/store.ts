// Where positions the server has not taken yet wait out a flight, a tunnel or a
// force-quit: one JSON file beside the download index, read and written whole
// because the queue holds one entry per title in progress, not a log.

import type { PendingProgress, PendingProgressStore } from '@kromatv/core';
import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.documentDirectory}kroma-progress/`;
const FILE = `${DIR}pending.json`;

export function pendingProgressStore(): PendingProgressStore {
  return {
    async read(): Promise<unknown> {
      try {
        return JSON.parse(await FileSystem.readAsStringAsync(FILE));
      } catch {
        return [];
      }
    },

    async write(entries: PendingProgress[]): Promise<void> {
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
      await FileSystem.writeAsStringAsync(FILE, JSON.stringify(entries)).catch(() => undefined);
    },
  };
}
