import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, ErrorState, formatTime, Image, Progress, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { Focusable } from '../navigation/FocusContext';
import type { Channel, EpgNow } from '../types';

interface LiveTVProps {
  category: string;
  setCategory: (category: string) => void;
  play: (channel: Channel, channels: Channel[]) => void;
}

export function LiveTV({ category, setCategory, play }: LiveTVProps) {
  const categories = useAsync(api.liveCategories, []);
  const [search, setSearch] = useState('');
  const channels = useAsync(() => api.channels(category || undefined, 0, search), [category, search]);
  const [selected, setSelected] = useState<Channel>(); const [epg, setEpg] = useState<EpgNow>();
  const [favorite, setFavorite] = useState(false);
  useEffect(() => {
    const items = channels.data?.items;
    if (!items?.length) { setSelected(undefined); return; }
    if (!selected || !items.some((item) => item.id === selected.id)) setSelected(items[0]);
  }, [channels.data]);
  useEffect(() => { if (!selected) return; let active = true; api.epg(selected.id).then((value) => active && setEpg(value)).catch(() => active && setEpg(undefined)); return () => { active = false; }; }, [selected?.id]);
  useEffect(() => { if (!selected) return; api.favorites().then((rows) => setFavorite(rows.some((row) => row.type === 'live' && row.id === selected.id))).catch(() => setFavorite(false)); }, [selected?.id]);
  const toggleFavorite = () => { if (!selected) return; const action = favorite ? api.unfavorite('live', selected.id) : api.favorite({ type: 'live', id: selected.id, item: selected }); action.then(() => setFavorite(!favorite)).catch(() => undefined); };
  return <main className="screen catalog-screen">
    <header className="section-header"><div><span className="eyebrow">LIVE TV</span><h1>Channels</h1></div><input className="search" value={search} onInput={(e) => setSearch(e.currentTarget.value)} placeholder="Search channels" aria-label="Search channels" /></header>
    <div className="live-layout">
      <aside className="category-panel"><h2>Categories</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list">
        <Focusable focusKey="live:cat:all" group="live-cats" index={0} orientation="vertical" neighbors={{ right: selected ? `live:channel:${selected.id}` : undefined }} onSelect={() => { setCategory(''); setSelected(undefined); }} className={!category ? 'active-item' : ''}>All channels</Focusable>
        {categories.data?.map((item, index) => <Focusable key={item.id} focusKey={`live:cat:${item.id}`} group="live-cats" index={index + 1} orientation="vertical" neighbors={{ right: selected ? `live:channel:${selected.id}` : undefined }} onSelect={() => { setCategory(item.id); setSelected(undefined); }} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>)}
      </div>}</aside>
      <section className="channel-panel"><div className="list-heading"><h2>{channels.data?.total || 0} channels</h2><span>OK to watch</span></div>
        {channels.loading ? <Spinner label="Loading channels…" /> : channels.error ? <ErrorState error={channels.error} retry={channels.retry} /> : !channels.data?.items.length ? <Empty>No channels found.</Empty> : <div className="channel-list">
          {channels.data.items.map((channel, index) => <Focusable key={channel.id} focusKey={`live:channel:${channel.id}`} group="live-channels" index={index} orientation="vertical" neighbors={{ left: category ? `live:cat:${category}` : 'live:cat:all', right: 'live:favorite' }} onFocus={() => setSelected(channel)} onSelect={() => play(channel, channels.data!.items)} className={`channel-row ${selected?.id === channel.id ? 'selected-row' : ''}`}>
            <span className="channel-number">{channel.number || index + 1}</span><Image src={channel.logo} alt={channel.name} className="channel-logo" /><span className="channel-copy"><strong>{channel.name}</strong><small>{selected?.id === channel.id ? epg?.current?.title || 'No programme information' : 'Press OK to watch'}</small></span><span className="play-glyph">▶</span>
          </Focusable>)}
        </div>}
      </section>
      <aside className="epg-panel">{selected ? <>
        <Image src={selected.logo} alt={selected.name} className="epg-logo" /><span className="eyebrow">NOW ON</span><h2>{selected.name}</h2>
        <div className="epg-program"><strong>{epg?.current?.title || 'No programme information'}</strong>{epg?.current && <small>{formatTime(epg.current.start)} – {formatTime(epg.current.end)}</small>}</div>
        <Progress value={epg?.progress || 0} />
        {epg?.next && <div className="up-next"><span>UP NEXT · {formatTime(epg.next.start)}</span><strong>{epg.next.title}</strong></div>}
        {epg?.current?.description && <p>{epg.current.description}</p>}
        <Focusable focusKey="live:favorite" group="live-info" index={0} orientation="vertical" neighbors={{ left: `live:channel:${selected.id}` }} onSelect={toggleFavorite} className="epg-favorite">{favorite ? '★ Favorite' : '☆ Add Favorite'}</Focusable>
      </> : <Empty>Select a channel.</Empty>}</aside>
    </div>
  </main>;
}
