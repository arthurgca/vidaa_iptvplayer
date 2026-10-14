import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Image, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { formatPlaybackTime } from '../player/Player';
import { isWatched, orderedEpisodes, resumePosition } from '../player/history';
import type { Episode, SeriesItem, VodItem } from '../types';

function FavoriteButton({ type, item }: { type: 'movie'|'series'; item: VodItem | SeriesItem }) {
  const t = useTranslate();
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { api.favorites().then((rows) => setFavorite(rows.some((row) => row.type === type && row.id === item.id))).catch(() => undefined); }, [type, item.id]);
  const toggle = () => {
    const action = favorite ? api.unfavorite(type, item.id) : api.favorite({ type, id: item.id, item });
    action.then(() => setFavorite(!favorite)).catch(() => undefined);
  };
  return <Focusable focusKey="details:favorite" group="details-actions" index={2} orientation="horizontal" onSelect={toggle} className="secondary-button">{favorite ? t('favorite.added') : t('favorite.add')}</Focusable>;
}

export function MovieDetails({ seed, play }: { seed: VodItem; play: (item: VodItem, resumeAt?: number) => void }) {
  const t = useTranslate(); const focus = useFocusManager();
  const history = useAsync(api.history, [seed.id]);
  const resume = resumePosition(history.data?.find((row) => row.type === 'movie' && row.id === seed.id));
  const detail = useAsync(() => api.vodInfo(seed.id), [seed.id]); const item = detail.data || seed;
  useEffect(() => {
    if (history.loading) return;
    const timer = window.setTimeout(() => { if (!focus.focus(focus.focused)) focus.focus('details:play'); }, 50);
    return () => window.clearTimeout(timer);
  }, [history.loading]);
  if (history.loading || (detail.loading && !seed.name)) return <Spinner />;
  if (detail.error) return <ErrorState error={detail.error} retry={detail.retry} />;
  return <main className="screen detail-screen" style={item.backdrop ? { backgroundImage: `linear-gradient(90deg,rgba(5,8,12,.98) 35%,rgba(5,8,12,.68)),url(${item.backdrop})` } : undefined}>
    <Image src={item.poster} alt={item.name} className="detail-poster" /><section className="detail-copy"><span className="eyebrow">{t('details.movie')}</span><h1>{item.name}</h1><div className="meta">{[item.year, item.duration, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join('  ·  ')}</div><p>{item.description || t('details.noDescription')}</p>
      <div className="detail-actions"><Focusable focusKey="details:play" group="details-actions" index={0} orientation="horizontal" onSelect={() => play(item, resume)} className="primary-button">{resume ? t('details.resume', { time: formatPlaybackTime(resume) }) : t('details.play')}</Focusable>{resume > 0 && <Focusable focusKey="details:restart" group="details-actions" index={1} orientation="horizontal" onSelect={() => play(item, 0)} className="secondary-button">{t('details.restart')}</Focusable>}<FavoriteButton type="movie" item={item} /></div>
    </section></main>;
}

export function SeriesDetails({ seed, play }: { seed: SeriesItem; play: (episode: Episode, series: SeriesItem, resumeAt: number, episodes: Episode[]) => void }) {
  const t = useTranslate(); const focus = useFocusManager();
  const detail = useAsync(() => api.seriesInfo(seed.id), [seed.id]); const [season, setSeason] = useState(1);
  const item = detail.data?.item || seed;
  const history = useAsync(api.history, [seed.id]);
  const allEpisodes = orderedEpisodes(detail.data?.episodes || []);
  const last = history.data?.find((row) => row.type === 'series' && allEpisodes.some((episode) => episode.id === row.id));
  const lastIndex = allEpisodes.findIndex((episode) => episode.id === last?.id);
  const continuation = lastIndex < 0 ? undefined : isWatched(last) ? allEpisodes[lastIndex + 1] : allEpisodes[lastIndex];
  const startEpisode = (episode: Episode, restart = false) => play(episode, item, restart ? 0 : resumePosition(history.data?.find((row) => row.type === 'series' && row.id === episode.id)), allEpisodes);
  const seasons = useMemo(() => [...new Set((detail.data?.episodes || []).map((episode) => episode.season))].sort((a,b) => a-b), [detail.data]);
  useEffect(() => { if (seasons.length && !seasons.includes(season)) setSeason(seasons[0]!); }, [seasons]);
  useEffect(() => {
    if (detail.loading || history.loading) return;
    const timer = window.setTimeout(() => { if (!focus.focus(focus.focused) && !focus.focus('details:continue')) focus.focus('details:favorite'); }, 50);
    return () => window.clearTimeout(timer);
  }, [detail.loading, history.loading]);
  if (detail.loading || history.loading) return <Spinner label={t('details.loadingEpisodes')} />;
  if (detail.error) return <ErrorState error={detail.error} retry={detail.retry} />;
  const episodes = allEpisodes.filter((episode) => episode.season === season);
  return <main className="screen series-detail"><header className="series-hero"><Image src={item.poster} alt={item.name} className="series-cover" /><div><span className="eyebrow">{t('details.series')}</span><h1>{item.name}</h1><div className="meta">{[item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · ')}</div><p>{item.description}</p><div className="detail-actions">{continuation && <Focusable focusKey="details:continue" group="details-actions" index={0} orientation="horizontal" onSelect={() => startEpisode(continuation)} className="primary-button">{t('details.continueEpisode', { name: continuation.name })}</Focusable>}<FavoriteButton type="series" item={item} /></div></div></header>
    <section className="season-browser"><div className="season-list"><h2>{t('details.seasons')}</h2>{seasons.map((value,index) => <Focusable key={value} focusKey={`series-detail:season:${value}`} group="seasons" index={index} orientation="vertical" neighbors={{ right: episodes[0] ? `series-detail:episode:${episodes[0].id}` : undefined }} onSelect={() => setSeason(value)} className={season === value ? 'active-item' : ''}>{t('details.season', { number: value })}</Focusable>)}</div>
      <div className="episode-list"><h2>{t('details.season', { number: season })}</h2>{episodes.map((episode,index) => {
        const row = history.data?.find((entry) => entry.type === 'series' && entry.id === episode.id);
        const resume = resumePosition(row);
        return <div key={episode.id} className="episode-actions">
          <Focusable focusKey={`series-detail:episode:${episode.id}`} group="episodes" index={index * 2} orientation="vertical" neighbors={{ left: `series-detail:season:${season}`, right: resume ? `series-detail:restart:${episode.id}` : undefined, up: index ? `series-detail:episode:${episodes[index - 1]!.id}` : ['details:continue', 'details:favorite'], down: episodes[index + 1] ? `series-detail:episode:${episodes[index + 1]!.id}` : undefined }} onSelect={() => startEpisode(episode)} className="episode-row"><span>S{String(episode.season).padStart(2,'0')}E{String(episode.episode).padStart(2,'0')}</span><strong>{episode.name}</strong><small>{isWatched(row) ? t('details.watched') : resume ? t('details.resume', { time: formatPlaybackTime(resume) }) : episode.duration}</small><b>▶</b></Focusable>
          {resume > 0 && <Focusable focusKey={`series-detail:restart:${episode.id}`} group="episode-restarts" index={index} orientation="vertical" neighbors={{ left: `series-detail:episode:${episode.id}` }} onSelect={() => startEpisode(episode, true)} className="secondary-button">{t('details.restart')}</Focusable>}
        </div>;
      })}</div></section>
  </main>;
}
