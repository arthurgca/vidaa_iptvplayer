import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Image, Progress } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { useSeriesInfo } from '../hooks/useSeriesInfo';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { restoreBrowseScroll, type ScrollPosition } from '../navigation/scroll';
import { formatPlaybackTime } from '../player/Player';
import { isWatched, orderedEpisodes, resumePosition } from '../player/history';
import { groupEpisodes, type LogicalEpisode } from '../player/episodeGroups';
import type { RemoteAction } from '../platform/remote';
import type { Episode, Season, SeriesItem } from '../types';
import { FavoriteButton } from '../components/FavoriteButton';

export interface SeriesContext { seasonId: string; episodeId?: string }
type Props = {
  seed: SeriesItem; context?: SeriesContext; saveContext?: (value: SeriesContext) => void;
  restoreFocus?: string; scroll?: ScrollPosition[]; back?: () => void;
  registerAction?: (handler: ((action: RemoteAction) => boolean) | null) => void;
  play: (episode: Episode, series: SeriesItem, resumeAt: number, episodes: Episode[]) => void;
};
const seasonOf = (episode: Episode) => episode.seasonId ?? String(episode.season ?? 'unknown');
const episodeKey = (id: string) => `series-detail:episode:${id}`;
const seasonKey = (id: string) => `series-detail:season:${id}`;

function StreamSelector({ episode, initial, title, choose, close }: {
  episode: LogicalEpisode; initial: string; title: string; choose: (stream: Episode) => void; close: () => void;
}) {
  const focus = useFocusManager(), t = useTranslate();
  useLayoutEffect(() => {
    focus.setScope('series-stream', `series-stream:${initial}`);
    return () => focus.setScope('root');
  }, []);
  return <div className="settings-modal"><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="series-stream-title">
    <h2 id="series-stream-title">{title}</h2><p>{t('series.chooseStream')}</p>
    <div className="settings-dialog-options">{episode.streams.map((stream, index) => {
      const key = `series-stream:${stream.id}`;
      return <Focusable key={stream.id} hoverFocus={false} focusKey={key} group="series-stream" index={index} orientation="vertical"
        neighbors={{ up: `series-stream:${episode.streams[Math.max(0, index - 1)]!.id}`, down: `series-stream:${episode.streams[Math.min(episode.streams.length - 1, index + 1)]!.id}`, left: key, right: key }}
        onSelect={() => choose(stream)} className="settings-choice">{t('series.stream', { number: index + 1 })}</Focusable>;
    })}</div>
    <button type="button" className="settings-dialog-close" onClick={close} tabIndex={-1} aria-label={t('common.back')}>×</button>
  </section></div>;
}

export function SeriesDetails({ seed, context, saveContext, restoreFocus, scroll, back, play, registerAction }: Props) {
  const t = useTranslate(), focus = useFocusManager();
  const detail = useSeriesInfo(seed.id), history = useAsync(api.history, [seed.id]);
  const [selectedSeason, setSelectedSeason] = useState<string>();
  const remembered = useRef<Record<string, string>>({});
  const restored = useRef(false);
  const launching = useRef(false);
  const [selector, setSelector] = useState<{ episode: LogicalEpisode; initial: string; origin: string; restart: boolean }>();
  const pendingFocus = useRef<string>();
  const remote = useRef<(action: RemoteAction) => boolean>(() => false);
  useLayoutEffect(() => { registerAction?.(action => remote.current(action)); return () => registerAction?.(null); }, []);
  useLayoutEffect(() => {
    if (!selector && pendingFocus.current) { focus.focus(pendingFocus.current, false); pendingFocus.current = undefined; }
  }, [selector]);
  const item = { ...seed };
  // Avoid Object.fromEntries: VIDAA's Chrome 69 baseline does not provide it.
  for (const [key, value] of Object.entries(detail.data?.item || {})) {
    if (value !== undefined && value !== '') (item as unknown as Record<string, unknown>)[key] = value;
  }
  const allEpisodes = useMemo(() => orderedEpisodes(detail.data?.episodes || []), [detail.data]);
  const logicalEpisodes = useMemo(() => groupEpisodes(allEpisodes, seed.id), [allEpisodes, seed.id]);
  const seriesHistory = useMemo(() => (history.data || []).filter(row => row.type === 'series' && (!row.series || row.series.id === seed.id)).slice().sort((a, b) => b.watchedAt - a.watchedAt), [history.data, seed.id]);
  const historyById = useMemo(() => new Map(seriesHistory.map(row => [row.id, row])), [seriesHistory]);
  const last = seriesHistory.find(row => allEpisodes.some(episode => episode.id === row.id));
  const lastIndex = logicalEpisodes.findIndex(episode => episode.streams.some(stream => stream.id === last?.id));
  const continuation = lastIndex < 0 ? undefined : isWatched(last) ? logicalEpisodes[lastIndex + 1] : logicalEpisodes[lastIndex];
  const seasons = useMemo(() => {
    const rows = new Map<string, Season>((detail.data?.seasons || []).map(row => [row.id, row]));
    allEpisodes.forEach(episode => { const id = seasonOf(episode); if (!rows.has(id)) rows.set(id, { id, number: episode.season ?? undefined }); });
    return [...rows.values()].sort((a,b) => ((a.number ?? Infinity) - (b.number ?? Infinity)) || 0);
  }, [detail.data, allEpisodes]);
  const restoreEpisode = restoreFocus?.startsWith('series-detail:episode:') ? restoreFocus.slice('series-detail:episode:'.length)
    : restoreFocus?.startsWith('series-detail:restart:') ? restoreFocus.slice('series-detail:restart:'.length) : context?.episodeId;
  const matches = (episode: LogicalEpisode, id?: string) => episode.id === id || episode.streams.some(stream => stream.id === id);
  const restoredEpisode = logicalEpisodes.find(episode => matches(episode, restoreEpisode));
  const preferred = selectedSeason ?? (restoredEpisode ? seasonOf(restoredEpisode) : context?.seasonId) ?? (last ? seasonOf(logicalEpisodes[lastIndex]!) : undefined);
  const activeSeason = seasons.find(row => row.id === preferred) || seasons[0];
  const episodes = useMemo(() => logicalEpisodes.filter(episode => seasonOf(episode) === activeSeason?.id), [logicalEpisodes, activeSeason?.id]);
  const seasonLabel = (row: Season) => row.name || (row.number === undefined ? t('series.unnumberedSeason') : t('details.season', { number: row.number }));
  const activeKey = activeSeason ? seasonKey(activeSeason.id) : 'series-detail:back';
  const rememberedId = activeSeason ? remembered.current[activeSeason.id] || context?.episodeId : undefined;
  const entryEpisode = episodes.find(episode => matches(episode, rememberedId)) || episodes[0];
  const episodeEntry = entryEpisode ? episodeKey(entryEpisode.id) : activeKey;
  const start = (episode: Episode, restart = false) => {
    if (launching.current) return;
    launching.current = true;
    const logical = logicalEpisodes.find(row => matches(row, episode.id));
    // Router captures focus synchronously when pushing playback. Save the row,
    // never the temporary dialog option, so Back restores the browsing context.
    focus.setScope('root');
    if (logical) { setSelectedSeason(seasonOf(logical)); focus.focus(episodeKey(logical.id), false); }
    saveContext?.({ seasonId: seasonOf(episode), episodeId: logical?.id ?? episode.id });
    play(episode, item, restart ? 0 : resumePosition(historyById.get(episode.id)), allEpisodes);
  };
  const lastVariant = (episode: LogicalEpisode) => seriesHistory.find(row => episode.streams.some(stream => stream.id === row.id));
  const requestPlay = (episode: LogicalEpisode, restart = false) => {
    if (launching.current || selector) return;
    if (episode.streams.length === 1) { start(episode.streams[0]!, restart); return; }
    setSelector({ episode, initial: lastVariant(episode)?.id ?? episode.streams[0]!.id, origin: focus.focused, restart });
  };
  const closeSelector = () => { pendingFocus.current = selector?.origin; setSelector(undefined); };
  remote.current = action => {
    if (!selector) return launching.current;
    if (action === 'BACK') closeSelector();
    else if (action === 'SELECT') focus.select();
    else if (action === 'NAV_UP') focus.move('up');
    else if (action === 'NAV_DOWN') focus.move('down');
    return true;
  };
  const remember = (episode: LogicalEpisode) => {
    remembered.current[seasonOf(episode)] = episode.id;
    saveContext?.({ seasonId: seasonOf(episode), episodeId: episode.id });
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (detail.loading || history.loading) { focus.focus('series-detail:back'); return; }
      if (restored.current) return;
      restored.current = true;
      restoreBrowseScroll(scroll);
      if (restoreFocus && focus.focus(restoreFocus)) return;
      if (restoredEpisode && focus.focus(episodeKey(restoredEpisode.id))) return;
      focus.focus(activeKey) || focus.focus('series-detail:back');
    }, 50);
    return () => clearTimeout(timer);
  }, [detail.loading, history.loading]);
  const rating = Number(item.rating), year = /^(\d{4})(?:-|$)/.exec(item.year || '')?.[1];
  return <main className="screen series-detail" aria-busy={detail.loading}>
    <header className="series-hero"><Image src={item.poster} alt={item.name} className="series-cover" /><div>
      <span className="eyebrow">{t('details.series')}</span><h1>{item.name}</h1>
      <div className="meta">{[year, item.genre, rating > 0 && rating <= 10 ? `★ ${rating}` : undefined].filter(Boolean).join(' · ')}</div>
      {item.description && <p>{item.description}</p>}
      <div className="detail-actions">
        <Focusable hoverFocus={false} focusKey="series-detail:back" group="details-actions" index={-1} orientation="horizontal" neighbors={{ down: detail.error ? 'series-detail:retry' : activeKey, left: 'series-detail:back' }} onSelect={() => back?.()} className="secondary-button">{t('common.back')}</Focusable>
        {continuation && <Focusable hoverFocus={false} focusKey="details:continue" group="details-actions" index={0} orientation="horizontal" neighbors={{ down: activeKey }} onSelect={() => requestPlay(continuation)} className="primary-button">{t('details.continueEpisode', { name: continuation.name || t('series.episode') })}</Focusable>}
        <FavoriteButton type="series" item={item} down={activeKey} />
      </div>
    </div></header>
    {detail.loading ? <div className="state-panel" role="status"><span className="spinner" />{t('details.loadingEpisodes')}</div>
      : detail.error ? <div className="state-panel error" role="alert"><p>{t('series.detailsUnavailable')}</p><Focusable focusKey="series-detail:retry" group="series-status" index={0} neighbors={{ up: 'series-detail:back' }} onSelect={() => { restored.current = false; detail.retry(); }} className="secondary-button">{t('common.retry')}</Focusable></div>
      : !activeSeason ? <div className="state-panel" role="status">{t('series.noEpisodes')}</div>
      : <section className="season-browser">
        <div className="season-list" data-scroll-key="series:seasons"><h2>{t('details.seasons')}</h2>
          {seasons.map((row, index) => <Focusable hoverFocus={false} key={row.id} focusKey={seasonKey(row.id)} group="seasons" index={index} orientation="vertical"
            neighbors={{ left: seasonKey(row.id), right: episodeEntry, up: index ? seasonKey(seasons[index - 1]!.id) : 'series-detail:back', down: seasonKey(seasons[Math.min(index + 1, seasons.length - 1)]!.id) }}
            onSelect={() => { setSelectedSeason(row.id); saveContext?.({ seasonId: row.id, episodeId: remembered.current[row.id] }); focus.focus(seasonKey(row.id)); }} className={row.id === activeSeason.id ? 'active-item' : ''}>
            {seasonLabel(row)}
          </Focusable>)}
        </div>
        <div className="episode-list" data-scroll-key="series:episodes" role="region" aria-label={seasonLabel(activeSeason)}>
          <h2>{seasonLabel(activeSeason)} <small>{t('series.episodeCount', { count: episodes.length })}</small></h2>
          {!episodes.length && <p className="series-empty" role="status">{t('series.emptySeason')}</p>}
          {episodes.map((episode, index) => {
            const row = lastVariant(episode), resume = resumePosition(row), watched = isWatched(row);
            const up = index ? episodeKey(episodes[index - 1]!.id) : continuation ? 'details:continue' : 'series-detail:back';
            const down = episodeKey(episodes[Math.min(index + 1, episodes.length - 1)]!.id);
            const restartKey = `series-detail:restart:${episode.id}`;
            return <div key={episode.id} className="episode-actions">
              <Focusable hoverFocus={false} focusKey={episodeKey(episode.id)} group="episodes" index={index} orientation="vertical" onFocus={() => remember(episode)}
                neighbors={{ left: activeKey, right: resume ? restartKey : episodeKey(episode.id), up, down }} onSelect={() => requestPlay(episode)} className={`episode-row${episode.thumbnail ? ' with-thumbnail' : ''}`}>
                <span className="episode-number">{episode.episode == null ? '—' : String(episode.episode).padStart(2, '0')}</span>
                {episode.thumbnail && <Image src={episode.thumbnail} alt="" className="episode-thumbnail" />}
                <div className="episode-copy"><strong>{episode.name || t('series.episode')}</strong>{episode.description && <p>{episode.description}</p>}
                  <small>{[episode.streams.length > 1 ? t('series.streamCount', { count: episode.streams.length }) : undefined, episode.duration, watched ? t('details.watched') : resume ? t('details.resume', { time: formatPlaybackTime(resume) }) : undefined].filter(Boolean).join(' · ')}</small>
                  {row && row.duration > 0 && <Progress value={watched ? 100 : row.position / row.duration * 100} />}
                </div><b aria-hidden="true">▶</b>
              </Focusable>
              {resume > 0 && <Focusable hoverFocus={false} focusKey={restartKey} group="episode-restarts" index={index} orientation="vertical" onFocus={() => remember(episode)} neighbors={{ left: episodeKey(episode.id), right: restartKey, up, down }} onSelect={() => requestPlay(episode, true)} className="secondary-button">{t('details.restart')}</Focusable>}
            </div>;
          })}
        </div>
      </section>}
    {selector && <StreamSelector episode={selector.episode} initial={selector.initial}
      title={selector.episode.season != null && selector.episode.episode != null ? `${item.name} — S${String(selector.episode.season).padStart(2, '0')}E${String(selector.episode.episode).padStart(2, '0')}` : selector.episode.name}
      close={closeSelector} choose={stream => start(stream, selector.restart)} />}
  </main>;
}
