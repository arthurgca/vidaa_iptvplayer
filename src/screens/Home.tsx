import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Focusable } from '../navigation/FocusContext';
import { formatTime, Spinner } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import { useAsync } from '../hooks/useAsync';
import { MediaRows, type MediaCard, type MediaRow } from '../components/MediaRows';
import { continueRow } from '../components/ContinueRow';
import { useCatalogFocus } from '../hooks/useCatalogFocus';
import type { ScrollPosition } from '../navigation/scroll';
import type { Favorite, HistoryItem, SeriesItem, VodItem } from '../types';

const destinations = ['live', 'movies', 'series', 'favorites', 'recent', 'settings'] as const;
function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  return <span className="clock">{formatTime(now)}</span>;
}

export function Home({ open, movie, series, resume, favorite, restoreFocus, scroll }: {
  open: (route: string) => void; movie: (item: VodItem) => void; series: (item: SeriesItem) => void;
  resume: (row: HistoryItem) => void; favorite: (row: Favorite) => void; restoreFocus?: string; scroll?: ScrollPosition[];
}) {
  const t = useTranslate(); const [selected, setSelected] = useState<MediaCard>();
  // Load independently so saved progress is available while a provider is slow.
  const history = useAsync(api.history, []);
  const favorites = useAsync(api.favorites, []);
  const movies = useAsync(() => api.vod(undefined, 0, '', 12), []);
  const shows = useAsync(() => api.series(undefined, 0, '', 12), []);
  const rows: MediaRow[] = [
    continueRow(history.data || [], 'home', t('browse.continue'), resume, t),
    { id: 'favorites', title: t('library.favorites.title'), cards: (favorites.data || []).slice(0, 12).map((row) => ({
      key: `home:favorite:${row.type}:${row.id}`, title: row.item.name, image: 'poster' in row.item ? row.item.poster : 'logo' in row.item ? row.item.logo : undefined,
      contain: row.type === 'live', subtitle: t(`kind.${row.type}`), select: () => favorite(row)
    })) },
    { id: 'movies', title: t('browse.movies'), cards: (movies.data?.items || []).slice(0, 12).map((item, index) => ({
      key: `home:movie:${item.id}:${index}`, title: item.name, image: item.poster, subtitle: [item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · '), select: () => movie(item)
    })) },
    { id: 'series', title: t('browse.series'), cards: (shows.data?.items || []).slice(0, 12).map((item, index) => ({
      key: `home:series:${item.id}:${index}`, title: item.name, image: item.poster, subtitle: [item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · '), select: () => series(item)
    })) }
  ].filter((row) => row.cards.length);
  const sources = [history, favorites, movies, shows];
  const loading = sources.some((source) => source.loading);
  const failed = sources.some((source) => source.error);
  const retry = () => sources.forEach((source) => { if (source.error) source.retry(); });
  const first = rows[0]?.cards[0]?.key;
  useCatalogFocus('home', loading, first, 'home:live', restoreFocus, scroll);
  return <main className="screen home-screen library-browser">
    <header className="topbar library-brand"><div><span className="wordmark">XSTREAM<span> / IPTV</span></span><span className="brand-caption">VIDAA</span></div><Clock /></header>
    <nav className="home-grid" aria-label={t('browse.navigation')}>
      {destinations.map((route, i) => <Focusable key={route} focusKey={`home:${route}`} group="home" index={i} orientation="horizontal"
        neighbors={{ left: `home:${destinations[Math.max(0, i - 1)]}`, right: `home:${destinations[Math.min(destinations.length - 1, i + 1)]}`, up: `home:${route}`, down: first || (failed ? 'home:retry' : `home:${route}`) }}
        onSelect={() => open(route)} className="home-card"><strong>{t(`home.card.${route}`)}</strong></Focusable>)}
    </nav>
    <div className="browse-intro"><span className="eyebrow">{t('browse.yourLibrary')}</span><h1>{selected?.title || t('home.title')}</h1><p>{selected?.subtitle || t('browse.homeHint')}</p></div>
    {failed && <div className="browse-warning"><span>{t('browse.unavailable')}</span><Focusable focusKey="home:retry" group="home-status" index={0} neighbors={{ up: 'home:live', down: first || 'home:retry' }} onSelect={retry} className="secondary-button">{t('common.retry')}</Focusable></div>}
    {rows.length ? <MediaRows rows={rows} scope="home" top={failed ? 'home:retry' : 'home:movies'} highlight={setSelected} /> : loading ? <Spinner /> : !failed && <div className="state-panel">{t('browse.homeEmpty')}</div>}
    <footer className="key-hint">{t('browse.remoteHint')}</footer>
  </main>;
}
