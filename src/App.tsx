import { RemoteHint } from './components/RemoteHint';
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
import type { SeriesContext } from './screens/SeriesDetails';
import { Home } from './screens/Home';
import { Favorites, Recent } from './screens/Library';
import { LiveTV } from './screens/LiveTV';
import { MediaCatalog } from './screens/MediaCatalog';
import { Settings } from './screens/Settings';
import { Guide } from './screens/Guide';
import { resumePosition } from './player/history';
import { captureBrowseScroll, type ScrollPosition } from './navigation/scroll';
import { emptyCatalogQuery, type CatalogQuery } from './catalogQuery';
import type { Channel, Episode, Favorite, HistoryItem, SeriesItem, VodItem } from './types';

type RouteName = 'home'|'live'|'guide'|'movies'|'movie-details'|'series'|'series-details'|'favorites'|'recent'|'settings'|'player';
interface Route { name: RouteName; data?: unknown; restoreFocus?: string; scroll?: ScrollPosition[]; seriesContext?: SeriesContext }
const PAGE_GROUPS: Partial<Record<RouteName, string[]>> = {
  favorites: ['favorites', 'favorites-items'], recent: ['recent', 'recent-remove'],
  'series-details': ['episodes', 'episode-restarts', 'seasons'], settings: ['settings-controls']
};
const PAGINATED_ROUTES: RouteName[] = ['movies', 'series', 'guide'];

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
  const [catalogs, setCatalogs] = useState(() => ({ live: emptyCatalogQuery(), movies: emptyCatalogQuery(), series: emptyCatalogQuery() }));
  const setCatalog = (kind: keyof typeof catalogs, query: CatalogQuery) => setCatalogs((value) => ({ ...value, [kind]: query }));
  const playerAction = useRef<((action: RemoteAction) => boolean) | null>(null);
  const settingsAction = useRef<((action: RemoteAction) => boolean) | null>(null);
  const current = routes[routes.length - 1];
  const currentRoute = useRef(current); currentRoute.current = current;
  const recentRequest = useRef(0);
  const navigationRequest = useRef(0);
  const playingLiveChannel = useRef<string>();
  const restoreTimer = useRef<number>();

  const restoreSoon = (key?: string) => {
    clearTimeout(restoreTimer.current);
    restoreTimer.current = window.setTimeout(() => { if (!key || !focus.focus(key)) focus.focusFirst(); }, 50);
    return restoreTimer.current;
  };
  useEffect(() => () => clearTimeout(restoreTimer.current), []);
  const push = (name: RouteName, data?: unknown, restoreFocus?: string) => { navigationRequest.current++; const scroll = captureBrowseScroll(); setRoutes((stack) => [...stack.slice(0,-1), { ...stack[stack.length-1]!, restoreFocus: focus.focused, scroll }, { name, data, restoreFocus }]); };
  const replaceHome = () => { navigationRequest.current++; setRoutes([{ name: 'home' }]); restoreSoon('home:live'); };
  const back = () => {
    navigationRequest.current++;
    if (routes.length <= 1) { try { window.close(); } catch { /* browser preview */ } return; }
    const previous = routes[routes.length - 2];
    const restoreFocus = previous?.restoreFocus;
    // Live browsing context is independent of channels surfed inside the player.
    setRoutes((stack) => stack.slice(0, -1).map((route, index) => index === stack.length - 2 ? { ...route, restoreFocus, scroll: route.restoreFocus === restoreFocus ? route.scroll : undefined } : route));
    if (previous?.name !== 'live') restoreSoon(restoreFocus);
  };
  useEffect(() => {
    let active = true;
    void api.status().then(async (status) => {
      if (!active) return;
      if (status.languageConfigured) setLanguage(status.language);
      if (!status.configured) { setRoutes([{ name: 'settings', data: { firstRun: true } }]); return; }
      const selection = status.autoplayLive ? await api.liveSelection().catch(() => undefined) : undefined;
      if (!active) return;
      if (selection?.channel) {
        const channel = selection.channel;
        playingLiveChannel.current = channel.id;
        setCatalog('live', { ...emptyCatalogQuery(), offset: selection.offset });
        setRoutes([{ name: 'home', restoreFocus: 'home:live' }, { name: 'live', restoreFocus: `live:channel:${channel.id}` }, {
          name: 'player', data: { type: 'live', id: channel.id, item: channel, extension: channel.extension, channels: selection.channels } satisfies Playable
        }]);
      } else setRoutes([{ name: 'home' }]);
    }).catch((error) => { if (active) setStartupError(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => listenToRemote((action) => {
    setLastKey(action);
    if (current?.name === 'settings' && settingsAction.current?.(action)) return;
    if (current?.name === 'player' && playerAction.current) { if (playerAction.current(action)) return; }
    if (action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') {
      const direction = action === 'CHANNEL_UP' ? -1 : 1;
      if (current?.name === 'live') focus.jump('live-channels', direction * 5);
      else if (current?.name === 'home') focus.jumpRow(direction * 5);
      else if (current && PAGINATED_ROUTES.includes(current.name)) {
        const key = current.name === 'guide' ? `guide:channels-${direction < 0 ? 'previous' : 'next'}`
          : `${current.name}:page:${direction < 0 ? 'previous' : 'next'}`;
        // Disabled and loading pagination controls are unregistered, so bounds stay identical to OK.
        if (focus.focus(key)) focus.select();
      } else if (current && PAGE_GROUPS[current.name]) focus.page(direction, PAGE_GROUPS[current.name]!);
      return;
    }
    if (action === 'BACK') { back(); return; }
    if (action === 'SELECT') { focus.select(); return; }
    if (action === 'NAV_UP') focus.move('up');
    if (action === 'NAV_DOWN') focus.move('down');
    if (action === 'NAV_LEFT') focus.move('left');
    if (action === 'NAV_RIGHT') focus.move('right');
  }), [current?.name, routes.length]);
  useEffect(() => {
    if (current?.name === 'player' || current?.name === 'movies' || current?.name === 'series' || current?.name === 'series-details' || current?.name === 'live') return;
    const initialSettingsFocus = current?.name === 'settings' ? `settings:tab:${(current.data as { firstRun?: boolean })?.firstRun ? 'provider' : 'general'}` : undefined;
    const timer = restoreSoon(current?.restoreFocus ?? initialSettingsFocus);
    return () => clearTimeout(timer);
  }, [current?.name]);

  if (startupError) return <ErrorState error={t('app.backendUnavailable', { error: startupError })} retry={() => location.reload()} />;
  if (!current) return <Spinner label={t('app.starting')} />;
  const playMovie = (item: VodItem, resumeAt = 0) => push('player', { type: 'movie', id: item.id, item, extension: item.extension, resumeAt } satisfies Playable);
  const playEpisode = (episode: Episode, series?: SeriesItem, resumeAt = 0, episodes?: Episode[]) => push('player', { type: 'series', id: episode.id, item: episode, extension: episode.extension, series, resumeAt, episodes } satisfies Playable);
  const openHomeRoute = async (route: string) => {
    if (route !== 'live') { push(route as RouteName); return; }
    const request = ++navigationRequest.current;
    const origin = currentRoute.current;
    const selection = await api.liveSelection().catch(() => undefined);
    if (request !== navigationRequest.current || currentRoute.current !== origin) return;
    if (selection) setCatalog('live', { ...emptyCatalogQuery(), offset: selection.offset });
    push('live', undefined, selection?.channel ? `live:channel:${selection.channel.id}` : undefined);
  };
  const openFavorite = (row: Favorite) => {
    if (row.type === 'live') push('player', { type: 'live', id: row.id, item: row.item as Channel, channels: [row.item as Channel] } satisfies Playable);
    else if (row.type === 'movie') push('movie-details', row.item);
    else push('series-details', row.item);
  };
  const openRecent = async (row: HistoryItem) => {
    const request = ++recentRequest.current; const origin = current;
    if (row.type === 'live') push('player', { type: 'live', id: row.id, item: row.item as Channel, channels: [row.item as Channel] } satisfies Playable);
    else if (row.type === 'movie') playMovie(row.item as VodItem, resumePosition(row));
    else {
      const detail = row.series ? await api.seriesInfo(row.series.id).catch(() => undefined) : undefined;
      if (request !== recentRequest.current || currentRoute.current !== origin) return;
      playEpisode(row.item as Episode, detail?.item || row.series, resumePosition(row), detail?.episodes);
    }
  };
  let screen: preact.ComponentChildren;
  switch (current.name) {
    case 'home': screen = <Home open={openHomeRoute} movie={(item) => push('movie-details', item)} series={(item) => push('series-details', item)} resume={openRecent} favorite={openFavorite} restoreFocus={current.restoreFocus} scroll={current.scroll} />; break;
    case 'live': screen = <LiveTV query={catalogs.live} setQuery={(query) => setCatalog('live', query)} restoreFocus={current.restoreFocus} scroll={current.scroll} lastTuned={playingLiveChannel.current} guide={() => push('guide')} play={(channel, channels) => { playingLiveChannel.current = channel.id; push('player', { type: 'live', id: channel.id, item: channel, extension: channel.extension, channels } satisfies Playable); }} />; break;
    case 'guide': screen = <Guide category={catalogs.live.category} play={(channel, channels) => push('player', { type: 'live', id: channel.id, item: channel, extension: channel.extension, channels } satisfies Playable)} />; break;
    case 'movies': screen = <MediaCatalog kind="movies" query={catalogs.movies} setQuery={(query) => setCatalog('movies', query)} restoreFocus={current.restoreFocus} scroll={current.scroll} open={(item) => push('movie-details', item)} />; break;
    case 'movie-details': screen = <MovieDetails seed={current.data as VodItem} play={playMovie} />; break;
    case 'series': screen = <MediaCatalog kind="series" query={catalogs.series} setQuery={(query) => setCatalog('series', query)} restoreFocus={current.restoreFocus} scroll={current.scroll} open={(item) => push('series-details', item)} />; break;
    case 'series-details': screen = <SeriesDetails key={(current.data as SeriesItem).id} seed={current.data as SeriesItem} play={playEpisode} back={back} restoreFocus={current.restoreFocus} scroll={current.scroll} context={current.seriesContext} saveContext={seriesContext => setRoutes(stack => stack.map((route, i) => i === stack.length - 1 ? { ...route, seriesContext } : route))} />; break;
    case 'favorites': screen = <Favorites open={openFavorite} />; break;
    case 'recent': screen = <Recent open={openRecent} />; break;
    case 'settings': screen = <Settings firstRun={Boolean((current.data as { firstRun?: boolean })?.firstRun)} language={language} setLanguage={setLanguage} saved={(current.data as { firstRun?: boolean })?.firstRun ? replaceHome : back} leave={back} registerAction={handler => { settingsAction.current = handler; }} cleared={() => setCatalogs({ live: emptyCatalogQuery(), movies: emptyCatalogQuery(), series: emptyCatalogQuery() })} />; break;
    case 'player': screen = <Player media={current.data as Playable} registerAction={(handler) => { playerAction.current = handler; }} close={back} liveChannelChanged={(channel) => { playingLiveChannel.current = channel.id; }} />; break;
  }
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1';
  // The hint is fixed to the bottom of the safe area, so the screen underneath reserves a band for it.
  const backHint = current.name !== 'home' && current.name !== 'player';
  const pageHint = PAGINATED_ROUTES.includes(current.name) || Boolean(PAGE_GROUPS[current.name]);
  return <div className={`app-shell${backHint ? ' with-hint' : ''}`}>{screen}{backHint && <div className="back-hint"><RemoteHint id="app.back" />{(current.name === 'movies' || current.name === 'series') ? <> · <RemoteHint id="movies.pageHint" /></> : current.name === 'live' ? <> · <RemoteHint id="app.channelNavigation" /></> : pageHint && <> · <RemoteHint id="app.pageNavigation" /></>}</div>}{debug &&<div className="debug-overlay">route: {current.name}<br/>focus: {focusedKey || 'none'}<br/>key: {lastKey || 'none'}<br/>viewport: {window.innerWidth}x{window.innerHeight} dpr:{window.devicePixelRatio || 1}</div>}</div>;
}
