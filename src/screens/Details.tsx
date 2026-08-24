import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/client';
import { ErrorState, Image, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { Focusable } from '../navigation/FocusContext';
import type { Episode, SeriesItem, VodItem } from '../types';

function FavoriteButton({ type, item }: { type: 'movie'|'series'; item: VodItem | SeriesItem }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { api.favorites().then((rows) => setFavorite(rows.some((row) => row.type === type && row.id === item.id))).catch(() => undefined); }, [type, item.id]);
  const toggle = () => {
    const action = favorite ? api.unfavorite(type, item.id) : api.favorite({ type, id: item.id, item });
    action.then(() => setFavorite(!favorite)).catch(() => undefined);
  };
  return <Focusable focusKey="details:favorite" group="details-actions" index={1} orientation="horizontal" onSelect={toggle} className="secondary-button">{favorite ? '★ In Favorites' : '☆ Add Favorite'}</Focusable>;
}

export function MovieDetails({ seed, play }: { seed: VodItem; play: (item: VodItem) => void }) {
  const detail = useAsync(() => api.vodInfo(seed.id), [seed.id]); const item = detail.data || seed;
  if (detail.loading && !seed.name) return <Spinner />;
  if (detail.error) return <ErrorState error={detail.error} retry={detail.retry} />;
  return <main className="screen detail-screen" style={item.backdrop ? { backgroundImage: `linear-gradient(90deg,rgba(5,8,12,.98) 35%,rgba(5,8,12,.68)),url(${item.backdrop})` } : undefined}>
    <Image src={item.poster} alt={item.name} className="detail-poster" /><section className="detail-copy"><span className="eyebrow">MOVIE</span><h1>{item.name}</h1><div className="meta">{[item.year, item.duration, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join('  ·  ')}</div><p>{item.description || 'No description available.'}</p>
      <div className="detail-actions"><Focusable focusKey="details:play" group="details-actions" index={0} orientation="horizontal" onSelect={() => play(item)} className="primary-button">▶ Play</Focusable><FavoriteButton type="movie" item={item} /></div>
    </section></main>;
}

export function SeriesDetails({ seed, play }: { seed: SeriesItem; play: (episode: Episode, series: SeriesItem) => void }) {
  const detail = useAsync(() => api.seriesInfo(seed.id), [seed.id]); const [season, setSeason] = useState(1);
  const item = detail.data?.item || seed;
  const seasons = useMemo(() => [...new Set((detail.data?.episodes || []).map((episode) => episode.season))].sort((a,b) => a-b), [detail.data]);
  useEffect(() => { if (seasons.length && !seasons.includes(season)) setSeason(seasons[0]!); }, [seasons]);
  if (detail.loading) return <Spinner label="Loading episodes…" />;
  if (detail.error) return <ErrorState error={detail.error} retry={detail.retry} />;
  const episodes = detail.data?.episodes.filter((episode) => episode.season === season) || [];
  return <main className="screen series-detail"><header className="series-hero"><Image src={item.poster} alt={item.name} className="series-cover" /><div><span className="eyebrow">SERIES</span><h1>{item.name}</h1><div className="meta">{[item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · ')}</div><p>{item.description}</p><FavoriteButton type="series" item={item} /></div></header>
    <section className="season-browser"><div className="season-list"><h2>Seasons</h2>{seasons.map((value,index) => <Focusable key={value} focusKey={`series-detail:season:${value}`} group="seasons" index={index} orientation="vertical" neighbors={{ right: episodes[0] ? `series-detail:episode:${episodes[0].id}` : undefined }} onSelect={() => setSeason(value)} className={season === value ? 'active-item' : ''}>Season {value}</Focusable>)}</div>
      <div className="episode-list"><h2>Season {season}</h2>{episodes.map((episode,index) => <Focusable key={episode.id} focusKey={`series-detail:episode:${episode.id}`} group="episodes" index={index} orientation="vertical" neighbors={{ left: `series-detail:season:${season}` }} onSelect={() => play(episode, item)} className="episode-row"><span>S{String(episode.season).padStart(2,'0')}E{String(episode.episode).padStart(2,'0')}</span><strong>{episode.name}</strong><small>{episode.duration}</small><b>▶</b></Focusable>)}</div></section>
  </main>;
}
