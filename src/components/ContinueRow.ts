import type { HistoryItem } from '../types';
import type { MediaRow } from './MediaRows';
import { continuing, historyImage, historyProgress, historyTitle } from '../screens/libraryRows';
import { formatPlaybackTime } from '../player/Player';
import type { TranslationKey } from '../i18n/en';

export function continueRow(history: HistoryItem[], scope: string, title: string, resume: (row: HistoryItem) => void,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string, type?: 'movie' | 'series'): MediaRow {
  return { id: 'continue', title, cards: continuing(history, type).map((row) => ({
    key: `${scope}:continue:${row.type}:${row.id}`, title: historyTitle(row), image: historyImage(row), progress: historyProgress(row),
    subtitle: t('library.continueAt', { time: formatPlaybackTime(row.position) }), select: () => resume(row)
  })) };
}
