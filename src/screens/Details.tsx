import { useEffect } from 'preact/hooks';
import { FavoriteButton } from '../components/FavoriteButton';
import { api } from '../api/client';
import { ErrorState, Image, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { formatPlaybackTime } from '../player/Player';
import { resumePosition } from '../player/history';
import type { VodItem } from '../types';

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

export { SeriesDetails } from './SeriesDetails';
