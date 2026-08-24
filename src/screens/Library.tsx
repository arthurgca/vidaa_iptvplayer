import { api } from '../api/client';
import { Empty, ErrorState, Image, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import type { Favorite, HistoryItem } from '../types';

export function Favorites({ open }: { open: (row: Favorite) => void }) {
  const t = useTranslate();
  const rows = useAsync(api.favorites, []);
  return <LibraryShell eyebrow={t('library.favorites.eyebrow')} title={t('library.favorites.title')}>{rows.loading ? <Spinner /> : rows.error ? <ErrorState error={rows.error} retry={rows.retry} /> : !rows.data?.length ? <Empty>{t('library.favorites.empty')}</Empty> : <div className="library-grid">{rows.data.map((row,index) => {
    const image = row.type === 'live' ? (row.item as import('../types').Channel).logo : (row.item as import('../types').VodItem).poster;
    return <Focusable key={`${row.type}-${row.id}`} focusKey={`favorites:${row.type}:${row.id}`} group="favorites" index={index} columns={5} orientation="grid" onSelect={() => open(row)} className="library-card"><Image src={image} alt={row.item.name} /><span><small>{t(`kind.${row.type}`)}</small><strong>{row.item.name}</strong></span></Focusable>;
  })}</div>}</LibraryShell>;
}

export function Recent({ open }: { open: (row: HistoryItem) => void }) {
  const t = useTranslate();
  const rows = useAsync(api.history, []);
  // Elapsed playback, not a clock time: formatted from a fixed UTC epoch so it never picks up a timezone.
  const elapsed = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);
  return <LibraryShell eyebrow={t('library.recent.eyebrow')} title={t('library.recent.title')}>{rows.loading ? <Spinner /> : rows.error ? <ErrorState error={rows.error} retry={rows.retry} /> : !rows.data?.length ? <Empty>{t('library.recent.empty')}</Empty> : <div className="recent-list">{rows.data.map((row,index) => <Focusable key={`${row.type}-${row.id}`} focusKey={`recent:${row.type}:${row.id}`} group="recent" index={index} orientation="vertical" onSelect={() => open(row)} className="recent-row"><Image src={'logo' in row.item ? row.item.logo : undefined} alt={row.item.name} /><span><small>{t(`kind.${row.type}`)}</small><strong>{row.item.name}</strong>{row.position > 10 && <em>{t('library.continueAt', { time: elapsed(row.position) })}</em>}</span><b>▶</b></Focusable>)}</div>}</LibraryShell>;
}

function LibraryShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: preact.ComponentChildren }) { return <main className="screen library-screen"><header className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div></header>{children}</main>; }
