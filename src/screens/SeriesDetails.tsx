import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Image, Progress } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { useSeriesInfo } from '../hooks/useSeriesInfo';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { restoreBrowseScroll, type ScrollPosition } from '../navigation/scroll';
import { formatPlaybackTime } from '../player/Player';
import { isWatched, orderedEpisodes, resumePosition } from '../player/history';
import type { Episode, Season, SeriesItem } from '../types';
import { FavoriteButton } from '../components/FavoriteButton';

export interface SeriesContext { seasonId: string; episodeId?: string }
type Props = {
  seed: SeriesItem; context?: SeriesContext; saveContext?: (value: SeriesContext) => void;
  restoreFocus?: string; scroll?: ScrollPosition[]; back?: () => void;
  play: (episode: Episode, series: SeriesItem, resumeAt: number, episodes: Episode[]) => void;
};
const seasonOf = (episode: Episode) => episode.seasonId ?? String(episode.season ?? 'unknown');
const episodeKey = (id: string) => `series-detail:episode:${id}`;
const seasonKey = (id: string) => `series-detail:season:${id}`;

export function SeriesDetails({ seed, context, saveContext, restoreFocus, scroll, back, play }: Props) {
  const t = useTranslate(), focus = useFocusManager();
  const detail = useSeriesInfo(seed.id), history = useAsync(api.history, [seed.id]);
  const [selectedSeason, setSelectedSeason] = useState<string>();
  const remembered = useRef<Record<string, string>>({});
  const restored = useRef(false);
  const item = { ...seed };
  // Avoid Object.fromEntries: VIDAA's Chrome 69 baseline does not provide it.
  for (const [key, value] of Object.entries(detail.data?.item || {})) {
    if (value !== undefined && value !== '') (item as unknown as Record<string, unknown>)[key] = value;
  }
  const allEpisodes = useMemo(() => orderedEpisodes(detail.data?.episodes || []), [detail.data]);
  const historyById = useMemo(() => new Map((history.data || []).filter(row => row.type === 'series').map(row => [row.id, row])), [history.data]);
  const last = history.data?.find(row => row.type === 'series' && allEpisodes.some(episode => episode.id === row.id));
  const lastIndex = allEpisodes.findIndex(episode => episode.id === last?.id);
  const continuation = lastIndex < 0 ? undefined : isWatched(last) ? allEpisodes[lastIndex + 1] : allEpisodes[lastIndex];
  const seasons = useMemo(() => {
    const rows = new Map<string, Season>((detail.data?.seasons || []).map(row => [row.id, row]));
    allEpisodes.forEach(episode => { const id = seasonOf(episode); if (!rows.has(id)) rows.set(id, { id, number: episode.season ?? undefined }); });
    return [...rows.values()].sort((a,b) => ((a.number ?? Infinity) - (b.number ?? Infinity)) || 0);
  }, [detail.data, allEpisodes]);
  const restoreEpisode = restoreFocus?.startsWith('series-detail:episode:') ? restoreFocus.slice('series-detail:episode:'.length)
    : restoreFocus?.startsWith('series-detail:restart:') ? restoreFocus.slice('series-detail:restart:'.length) : context?.episodeId;
  const restoredEpisode = allEpisodes.find(episode => episode.id === restoreEpisode);
  const preferred = selectedSeason ?? (restoredEpisode ? seasonOf(restoredEpisode) : context?.seasonId) ?? (last ? seasonOf(allEpisodes[lastIndex]!) : undefined);
  const activeSeason = seasons.find(row => row.id === preferred) || seasons[0];
  const episodes = useMemo(() => allEpisodes.filter(episode => seasonOf(episode) === activeSeason?.id), [allEpisodes, activeSeason?.id]);
  const seasonLabel = (row: Season) => row.name || (row.number === undefined ? t('series.unnumberedSeason') : t('details.season', { number: row.number }));
  const activeKey = activeSeason ? seasonKey(activeSeason.id) : 'series-detail:back';
  const rememberedId = activeSeason ? remembered.current[activeSeason.id] || context?.episodeId : undefined;
  const entryEpisode = episodes.find(episode => episode.id === rememberedId) || episodes[0];
  const episodeEntry = entryEpisode ? episodeKey(entryEpisode.id) : activeKey;
  const start = (episode: Episode, restart = false) => {
    saveContext?.({ seasonId: seasonOf(episode), episodeId: episode.id });
    play(episode, item, restart ? 0 : resumePosition(historyById.get(episode.id)), allEpisodes);
  };
  const remember = (episode: Episode) => {
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
      if (restoreEpisode && episodes[0] && focus.focus(episodeKey(episodes[0].id))) return;
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
        {continuation && <Focusable hoverFocus={false} focusKey="details:continue" group="details-actions" index={0} orientation="horizontal" neighbors={{ down: activeKey }} onSelect={() => start(continuation)} className="primary-button">{t('details.continueEpisode', { name: continuation.name || t('series.episode') })}</Focusable>}
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
            const row = historyById.get(episode.id), resume = resumePosition(row), watched = isWatched(row);
            const up = index ? episodeKey(episodes[index - 1]!.id) : continuation ? 'details:continue' : 'series-detail:back';
            const down = episodeKey(episodes[Math.min(index + 1, episodes.length - 1)]!.id);
            const restartKey = `series-detail:restart:${episode.id}`;
            return <div key={episode.id} className="episode-actions">
              <Focusable hoverFocus={false} focusKey={episodeKey(episode.id)} group="episodes" index={index} orientation="vertical" onFocus={() => remember(episode)}
                neighbors={{ left: activeKey, right: resume ? restartKey : episodeKey(episode.id), up, down }} onSelect={() => start(episode)} className={`episode-row${episode.thumbnail ? ' with-thumbnail' : ''}`}>
                <span className="episode-number">{episode.episode == null ? '—' : String(episode.episode).padStart(2, '0')}</span>
                {episode.thumbnail && <Image src={episode.thumbnail} alt="" className="episode-thumbnail" />}
                <div className="episode-copy"><strong>{episode.name || t('series.episode')}</strong>{episode.description && <p>{episode.description}</p>}
                  <small>{[episode.duration, watched ? t('details.watched') : resume ? t('details.resume', { time: formatPlaybackTime(resume) }) : undefined].filter(Boolean).join(' · ')}</small>
                  {row && row.duration > 0 && <Progress value={watched ? 100 : row.position / row.duration * 100} />}
                </div><b aria-hidden="true">▶</b>
              </Focusable>
              {resume > 0 && <Focusable hoverFocus={false} focusKey={restartKey} group="episode-restarts" index={index} orientation="vertical" onFocus={() => remember(episode)} neighbors={{ left: episodeKey(episode.id), right: restartKey, up, down }} onSelect={() => start(episode, true)} className="secondary-button">{t('details.restart')}</Focusable>}
            </div>;
          })}
        </div>
      </section>}
  </main>;
}
