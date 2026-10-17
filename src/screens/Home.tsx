import { RemoteHint } from '../components/RemoteHint';
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
import { defaultHomePreferences, type HomeConfiguration, type HomePreviewRow } from '../homePreferences';

const destinations = ['live', 'movies', 'series', 'favorites', 'recent', 'settings'] as const;
function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  return <span className="clock">{formatTime(now)}</span>;
}

export function Home({ open, movie, series, resume, favorite, restoreFocus, scroll, configuration: provided }: {
  open: (route: string) => void; movie: (item: VodItem) => void; series: (item: SeriesItem) => void;
  resume: (row: HistoryItem) => void; favorite: (row: Favorite) => void; restoreFocus?: string; scroll?: ScrollPosition[];
  configuration?: HomeConfiguration;
}) {
  const t = useTranslate(); const [selected, setSelected] = useState<MediaCard>();
  // Load independently so saved progress is available while a provider is slow.
  const history = useAsync(api.history, []);
  const favorites = useAsync(api.favorites, []);
  const configuration = useAsync<HomeConfiguration>(async () => {
    if (provided) return provided;
    const config = await api.config();
    return { homeProviderKey: config.homeProviderKey || '', homePreferences: config.homePreferences ?? null };
  }, [provided?.homeProviderKey, JSON.stringify(provided?.homePreferences)]);
  const current = provided ?? configuration.data;
  const preferences = current?.homePreferences ?? defaultHomePreferences();
  const ready = Boolean(current || configuration.error);
  const provider = current?.homeProviderKey || '';
  type Preview = { rows: HomePreviewRow[]; failed: boolean; provider: string; customized: boolean };
  const previews = (kind: 'movies' | 'series', ids: string[] | null) => async (): Promise<Preview> => {
    const context = { provider, customized: ids !== null };
    if (!ready || ids?.length === 0) return { ...context, rows: [], failed: false };
    if (ids) return { ...context, ...await api.homeCatalog(kind, provider, ids) };
    const page = await (kind === 'movies' ? api.vod : api.series)(undefined, 0, '', 12);
    return { ...context, rows: [{ id: kind, items: page.items.slice(0, 12) }], failed: false };
  };
  const movies = useAsync(previews('movies', preferences.movieCategoryIds), [ready, current?.homeProviderKey, JSON.stringify(preferences.movieCategoryIds)]);
  const shows = useAsync(previews('series', preferences.seriesCategoryIds), [ready, current?.homeProviderKey, JSON.stringify(preferences.seriesCategoryIds)]);
  const visiblePreviews = (data: Preview | undefined, ids: string[] | null) => {
    if (!data || data.provider !== provider || data.customized !== (ids !== null)) return [];
    if (ids === null) return data.rows;
    // Keep surviving keyed rows during a new request; never render a now-hidden selection.
    const available = new Map(data.rows.map(row => [row.id, row]));
    return ids.flatMap(id => available.has(id) ? [available.get(id)!] : []);
  };
  const categoryRows = (kind: 'movies' | 'series', rows: HomePreviewRow[], customized: boolean): MediaRow[] => rows.map(row => ({
    id: customized ? `${kind}:category:${row.id}` : kind,
    title: row.title || t(kind === 'movies' ? 'browse.movies' : 'browse.series'),
    cards: row.items.slice(0, 12).map((item, index) => ({
      key: customized ? `home:${kind}:category:${row.id}:${item.id}` : `home:${kind === 'movies' ? 'movie' : 'series'}:${item.id}:${index}`,
      title: item.name, image: item.poster, subtitle: [item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · '),
      select: () => (kind === 'movies' ? movie : series)(item)
    }))
  }));
  const rows: MediaRow[] = [
    continueRow(ready && preferences.sectionVisibility.continueWatching ? history.data || [] : [], 'home', t('browse.continue'), resume, t),
    { id: 'favorites', title: t('library.favorites.title'), cards: (ready && preferences.sectionVisibility.favorites ? favorites.data || [] : []).slice(0, 12).map((row) => ({
      key: `home:favorite:${row.type}:${row.id}`, title: row.item.name, image: 'poster' in row.item ? row.item.poster : 'logo' in row.item ? row.item.logo : undefined,
      contain: row.type === 'live', subtitle: t(`kind.${row.type}`), select: () => favorite(row)
    })) },
    ...categoryRows('movies', visiblePreviews(movies.data, preferences.movieCategoryIds), preferences.movieCategoryIds !== null),
    ...categoryRows('series', visiblePreviews(shows.data, preferences.seriesCategoryIds), preferences.seriesCategoryIds !== null)
  ].filter((row) => row.cards.length);
  useEffect(() => {
    if (selected && !rows.some(row => row.cards.some(card => card.key === selected.key))) setSelected(undefined);
  }, [rows.map(row => row.cards.map(card => card.key).join(',')).join('|')]);
  const sources = [history, favorites, movies, shows, configuration];
  const loading = sources.some((source) => source.loading);
  const failed = sources.some((source) => source.error) || movies.data?.failed || shows.data?.failed;
  const retry = () => { sources.forEach((source) => { if (source.error) source.retry(); }); if (movies.data?.failed) movies.retry(); if (shows.data?.failed) shows.retry(); };
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
    <footer className="key-hint"><RemoteHint id="browse.remoteHint" /></footer>
  </main>;
}
