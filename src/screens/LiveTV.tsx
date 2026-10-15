import { useEffect, useState } from 'preact/hooks';
import { api, LIVE_PAGE_SIZE } from '../api/client';
import { Empty, ErrorState, formatTime, Image, Progress, Spinner } from '../components/common';
import { SearchField } from '../components/SearchField';
import { CatalogPagination } from '../components/CatalogPagination';
import { useAsync } from '../hooks/useAsync';
import { useCatalogPage, filterCatalog, type CatalogQuery } from '../hooks/useCatalogPage';
import { useCatalogFocus } from '../hooks/useCatalogFocus';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import { PREVIOUS_FOCUS } from '../navigation/FocusManager';
import type { ScrollPosition } from '../navigation/scroll';
import type { Channel, EpgNow, Favorite } from '../types';

interface LiveTVProps {
  query: CatalogQuery;
  setQuery: (query: CatalogQuery) => void;
  restoreFocus?: string;
  scroll?: ScrollPosition[];
  lastTuned?: string;
  guide: () => void;
  play: (channel: Channel, channels: Channel[]) => void;
}

export function LiveTV({ query, setQuery, restoreFocus, scroll, lastTuned, play, guide }: LiveTVProps) {
  const t = useTranslate();
  const categories = useAsync(api.liveCategories, []);
  const { category, search, offset } = query;
  const setCategory = (value: string) => setQuery(filterCatalog(query, { category: value }));
  const setSearch = (value: string) => setQuery(filterCatalog(query, { search: value }));
  const channels = useCatalogPage(() => api.channels(category || undefined, offset, search), 'live', query);
  const [selected, setSelected] = useState<Channel>();
  const [programme, setProgramme] = useState<{ id: string; value?: EpgNow }>();
  const epg = programme?.id === selected?.id ? programme?.value : undefined;
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [saving, setSaving] = useState(false); const [favoriteError, setFavoriteError] = useState('');
  const favorite = favorites.some((row) => row.type === 'live' && row.id === selected?.id);
  useEffect(() => {
    const items = channels.data?.items;
    if (!items?.length) { setSelected(undefined); return; }
    if (!selected || !items.some((item) => item.id === selected.id)) setSelected(items[0]);
  }, [channels.data]);
  useEffect(() => {
    if (!selected) return;
    let active = true; const id = selected.id; const controller = new AbortController();
    const refresh = () => { api.epg(id, controller.signal).then((value) => { if (active) setProgramme({ id, value }); }).catch(() => { if (active) setProgramme({ id }); }); };
    // Rapid arrow repeats don't produce a request for every intermediate channel.
    const delay = window.setTimeout(refresh, 120);
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; controller.abort(); window.clearTimeout(delay); window.clearInterval(timer); };
  }, [selected?.id]);
  useEffect(() => { let active = true; api.favorites().then((rows) => { if (active) setFavorites(rows); }).catch(() => { if (active) setFavoriteError(t('browse.unavailable')); }); return () => { active = false; }; }, []);
  const toggleFavorite = () => {
    if (!selected || saving) return;
    const channel = selected; const remove = favorite; setSaving(true); setFavoriteError('');
    const action = remove ? api.unfavorite('live', channel.id) : api.favorite({ type: 'live', id: channel.id, item: channel });
    action.then(() => setFavorites((rows) => remove ? rows.filter((row) => row.type !== 'live' || row.id !== channel.id) : [...rows, { type: 'live', id: channel.id, item: channel, addedAt: Date.now() }]))
      .catch((reason) => setFavoriteError(reason.message)).finally(() => setSaving(false));
  };
  const categoryKey = category ? `live:cat:${category}` : 'live:cat:all';
  const firstChannel = channels.data?.items[0];
  const lastChannel = channels.data?.items[channels.data.items.length - 1];
  const firstChannelKey = firstChannel ? `live:channel:${firstChannel.id}` : undefined;
  const lastChannelKey = lastChannel ? `live:channel:${lastChannel.id}` : undefined;
  const contentKey = selected ? `live:channel:${selected.id}` : channels.error ? 'live:retry' : offset ? 'live:page:previous' : undefined;
  useCatalogFocus('live', channels.loading, firstChannelKey, channels.error ? 'live:retry' : categoryKey, restoreFocus, scroll);
  // Kept independent of `selected` so moving through the list does not re-register the search node.
  const searchReturn = firstChannel ? `live:channel:${firstChannel.id}` : categoryKey;
  return <main className="screen catalog-screen live-browser">
    <header className="section-header"><div><span className="eyebrow">{t('live.eyebrow')}</span><h1>{t('live.title')}</h1></div><SearchField focusKey="live:search" value={search} input={setSearch} placeholder={t('live.search')} neighbors={{ down: [PREVIOUS_FOCUS, searchReturn], right: 'live:guide' }} /><Focusable focusKey="live:guide" group="live-header" index={1} orientation="horizontal" neighbors={{ left: 'live:search', down: searchReturn }} onSelect={guide} className="secondary-button">{t('guide.title')}</Focusable></header>
    <div className="live-layout">
      <aside className="category-panel"><h2>{t('common.categories')}</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list" data-scroll-key="live:categories">
        <Focusable focusKey="live:cat:all" group="live-cats" index={0} orientation="vertical" neighbors={{ right: contentKey, up: 'live:search' }} onSelect={() => { setCategory(''); setSelected(undefined); }} className={!category ? 'active-item' : ''}>{t('live.allChannels')}</Focusable>
        {categories.data?.map((item, index) => <Focusable key={item.id} focusKey={`live:cat:${item.id}`} group="live-cats" index={index + 1} orientation="vertical" neighbors={{ right: contentKey }} onSelect={() => { setCategory(item.id); setSelected(undefined); }} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>)}
      </div>}</aside>
      <section className="channel-panel"><div className="list-heading"><h2>{t('live.channelCount', { count: channels.data?.total || 0 })}</h2><span>{t('live.okToWatch')}</span></div>
        {channels.loading ? <Spinner label={t('live.loading')} /> : channels.error ? <div className="state-panel error"><p>{channels.error}</p><Focusable focusKey="live:retry" group="live-status" index={0} neighbors={{ left: categoryKey, up: 'live:search', down: offset ? 'live:page:previous' : undefined }} onSelect={channels.retry} className="secondary-button">{t('common.retry')}</Focusable></div> : !channels.data?.items.length ? <Empty>{t('live.empty')}</Empty> : <div className="channel-list" data-scroll-key="live:channels">
          {channels.data.items.map((channel, index) => <Focusable key={channel.id} focusKey={`live:channel:${channel.id}`} group="live-channels" index={index} orientation="vertical" neighbors={{ left: categoryKey, right: 'live:favorite', up: index === 0 ? 'live:search' : undefined, down: index === channels.data!.items.length - 1 ? ['live:page:next', 'live:page:previous'] : undefined }} onFocus={() => setSelected(channel)} onSelect={() => play(channel, channels.data!.items)} className={`channel-row ${selected?.id === channel.id ? 'selected-row' : ''}`}>
            <span className="channel-number">{channel.number || offset + index + 1}</span><Image src={channel.logo} alt={channel.name} className="channel-logo" /><span className="channel-copy"><strong>{favorites.some((row) => row.type === 'live' && row.id === channel.id) && <span className="channel-star">★ </span>}{channel.name}</strong><small>{selected?.id === channel.id ? epg?.current?.title || t('common.noProgramme') : t('live.pressOk')}</small></span>{lastTuned === channel.id ? <span className="tuned-badge">▶<small>{t('live.lastTuned')}</small></span> : <span className="play-glyph">▶</span>}
          </Focusable>)}
        </div>}
        <CatalogPagination kind="live" page={channels.data} offset={offset} pageSize={LIVE_PAGE_SIZE} loading={channels.loading} change={(value) => setQuery({ ...query, offset: value })} firstItem={firstChannelKey} lastItem={lastChannelKey} fallback={categoryKey} />
      </section>
      <aside className="epg-panel">{selected ? <>
        <Image src={selected.logo} alt={selected.name} className="epg-logo" /><span className="eyebrow">{t('live.nowOn')}</span><h2>{selected.name}</h2>
        <div className="epg-program"><strong>{epg?.current?.title || t('common.noProgramme')}</strong>{epg?.current && <small>{formatTime(epg.current.start)} – {formatTime(epg.current.end)}</small>}</div>
        {epg?.current && <Progress value={epg.progress} />}
        <div className="up-next">{epg?.next ? <><span>{t('live.upNext', { time: formatTime(epg.next.start) })}</span><strong>{epg.next.title}</strong></> : <span>{t('live.noNext')}</span>}</div>
        {epg?.current?.description && <p>{epg.current.description}</p>}
        {favoriteError && <small className="error" role="status">{favoriteError}</small>}
        <Focusable focusKey="live:favorite" group="live-info" index={0} orientation="vertical" neighbors={{ left: `live:channel:${selected.id}`, right: 'live:favorite', up: 'live:guide', down: 'live:favorite' }} onSelect={toggleFavorite} className="epg-favorite">{saving ? t('library.saving') : favorite ? t('favorite.short') : t('favorite.add')}</Focusable>
      </> : <Empty>{t('live.selectChannel')}</Empty>}</aside>
    </div>
  </main>;
}
