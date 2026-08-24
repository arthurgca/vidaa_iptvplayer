import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api/client';
import { ErrorState, Spinner } from './components/common';
import { I18nProvider, useTranslate } from './i18n/I18nContext';
import { detectLanguage, type Language } from './i18n';
import { FocusProvider, useFocusManager, useFocusedKey } from './navigation/FocusContext';
import type { Playable } from './player/Player';
import { Player } from './player/Player';
import { listenToRemote, type RemoteAction } from './platform/remote';
import { MovieDetails, SeriesDetails } from './screens/Details';
import { Home } from './screens/Home';
import { Favorites, Recent } from './screens/Library';
import { LiveTV } from './screens/LiveTV';
import { MediaCatalog } from './screens/MediaCatalog';
import { Settings } from './screens/Settings';
import type { Channel, Episode, Favorite, HistoryItem, SeriesItem, VodItem } from './types';

type RouteName = 'home'|'live'|'movies'|'movie-details'|'series'|'series-details'|'favorites'|'recent'|'settings'|'player';
interface Route { name: RouteName; data?: unknown; restoreFocus?: string }

export function App() {
  // The TV's own language carries the UI until the backend answers with a preference someone actually chose.
  const [language, setLanguage] = useState<Language>(detectLanguage);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <I18nProvider language={language}><FocusProvider><AppRouter language={language} setLanguage={setLanguage} /></FocusProvider></I18nProvider>;
}

interface RouterProps { language: Language; setLanguage: (language: Language) => void }

function AppRouter({ language, setLanguage }: RouterProps) {
  const focus = useFocusManager(); const focusedKey = useFocusedKey(); const t = useTranslate();
  const [routes, setRoutes] = useState<Route[]>([]); const [startupError, setStartupError] = useState(''); const [lastKey, setLastKey] = useState('');
  const [liveCategory, setLiveCategory] = useState('');
  const playerAction = useRef<((action: RemoteAction) => boolean) | null>(null);
  const current = routes[routes.length - 1];

  const restoreSoon = (key?: string) => window.setTimeout(() => { if (!key || !focus.focus(key)) focus.focusFirst(); }, 50);
  const push = (name: RouteName, data?: unknown) => setRoutes((stack) => [...stack.slice(0,-1), { ...stack[stack.length-1]!, restoreFocus: focus.focused }, { name, data }]);
  const replaceHome = () => { setRoutes([{ name: 'home' }]); restoreSoon('home:live'); };
  const back = () => {
    if (routes.length <= 1) { try { window.close(); } catch { /* browser preview */ } return; }
    const previous = routes[routes.length - 2]; setRoutes((stack) => stack.slice(0, -1)); restoreSoon(previous?.restoreFocus);
  };
  useEffect(() => { api.status().then((status) => {
    if (status.languageConfigured) setLanguage(status.language);
    setRoutes([{ name: status.configured ? 'home' : 'settings', data: { firstRun: true } }]);
  }).catch((error) => setStartupError(error.message)); }, []);
  useEffect(() => listenToRemote((action) => {
    setLastKey(action);
    if (current?.name === 'player' && playerAction.current) { if (playerAction.current(action)) return; }
    if (action === 'BACK') { back(); return; }
    if (action === 'SELECT') { focus.select(); return; }
    if (action === 'NAV_UP') focus.move('up');
    if (action === 'NAV_DOWN') focus.move('down');
    if (action === 'NAV_LEFT') focus.move('left');
    if (action === 'NAV_RIGHT') focus.move('right');
  }), [current?.name, routes.length]);
  useEffect(() => { if (current?.name !== 'player') restoreSoon(current?.restoreFocus); }, [current?.name]);

  if (startupError) return <ErrorState error={t('app.backendUnavailable', { error: startupError })} retry={() => location.reload()} />;
  if (!current) return <Spinner label={t('app.starting')} />;
  const playMovie = (item: VodItem, resumeAt = 0) => push('player', { type: 'movie', id: item.id, item, extension: item.extension, resumeAt } satisfies Playable);
  const playEpisode = (episode: Episode, series?: SeriesItem, resumeAt = 0) => push('player', { type: 'series', id: episode.id, item: episode, extension: episode.extension, series, resumeAt } satisfies Playable);
  const openFavorite = (row: Favorite) => {
    if (row.type === 'live') push('player', { type: 'live', id: row.id, item: row.item as Channel, channels: [row.item as Channel] } satisfies Playable);
    else if (row.type === 'movie') push('movie-details', row.item);
    else push('series-details', row.item);
  };
  const openRecent = (row: HistoryItem) => {
    if (row.type === 'live') push('player', { type: 'live', id: row.id, item: row.item as Channel, channels: [row.item as Channel] } satisfies Playable);
    else if (row.type === 'movie') playMovie(row.item as VodItem, row.position);
    else playEpisode(row.item as Episode, undefined, row.position);
  };
  let screen: preact.ComponentChildren;
  switch (current.name) {
    case 'home': screen = <Home open={(route) => push(route as RouteName)} />; break;
    case 'live': screen = <LiveTV category={liveCategory} setCategory={setLiveCategory} play={(channel, channels) => push('player', { type: 'live', id: channel.id, item: channel, extension: channel.extension, channels } satisfies Playable)} />; break;
    case 'movies': screen = <MediaCatalog kind="movies" open={(item) => push('movie-details', item)} />; break;
    case 'movie-details': screen = <MovieDetails seed={current.data as VodItem} play={playMovie} />; break;
    case 'series': screen = <MediaCatalog kind="series" open={(item) => push('series-details', item)} />; break;
    case 'series-details': screen = <SeriesDetails seed={current.data as SeriesItem} play={playEpisode} />; break;
    case 'favorites': screen = <Favorites open={openFavorite} />; break;
    case 'recent': screen = <Recent open={openRecent} />; break;
    case 'settings': screen = <Settings firstRun={Boolean((current.data as { firstRun?: boolean })?.firstRun)} language={language} setLanguage={setLanguage} saved={(current.data as { firstRun?: boolean })?.firstRun ? replaceHome : back} />; break;
    case 'player': screen = <Player media={current.data as Playable} registerAction={(handler) => { playerAction.current = handler; }} close={back} />; break;
  }
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1';
  return <div className="app-shell">{screen}{current.name !== 'home' && current.name !== 'player' && <div className="back-hint">{t('app.back')}</div>}{debug && <div className="debug-overlay">route: {current.name}<br/>focus: {focusedKey || 'none'}<br/>key: {lastKey || 'none'}<br/>viewport: {window.innerWidth}x{window.innerHeight} dpr:{window.devicePixelRatio || 1}</div>}</div>;
}
