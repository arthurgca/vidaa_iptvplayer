import { useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, ErrorState, Image, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { Focusable } from '../navigation/FocusContext';
import type { SeriesItem, VodItem } from '../types';

type Props = { kind: 'movies'|'series'; open: (item: VodItem | SeriesItem) => void };
export function MediaCatalog({ kind, open }: Props) {
  const isMovie = kind === 'movies'; const [category, setCategory] = useState(''); const [search, setSearch] = useState('');
  const categories = useAsync(isMovie ? api.vodCategories : api.seriesCategories, [kind]);
  const media = useAsync(() => isMovie ? api.vod(category || undefined, 0, search) : api.series(category || undefined, 0, search), [kind, category, search]);
  const title = isMovie ? 'Movies' : 'Series';
  const firstItemKey = media.data?.items[0] ? `${kind}:item:${media.data.items[0].id}` : undefined;
  return <main className="screen catalog-screen"><header className="section-header"><div><span className="eyebrow">ON DEMAND</span><h1>{title}</h1></div><input className="search" value={search} onInput={(e) => setSearch(e.currentTarget.value)} placeholder={`Search ${title.toLowerCase()}`} /></header>
    <div className="media-layout"><aside className="category-panel"><h2>Categories</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list">
      <Focusable focusKey={`${kind}:cat:all`} group={`${kind}-cats`} index={0} orientation="vertical" neighbors={{ right: firstItemKey }} onSelect={() => setCategory('')} className={!category ? 'active-item' : ''}>All {title.toLowerCase()}</Focusable>
      {categories.data?.map((item,index) => <Focusable key={item.id} focusKey={`${kind}:cat:${item.id}`} group={`${kind}-cats`} index={index+1} orientation="vertical" neighbors={{ right: firstItemKey }} onSelect={() => setCategory(item.id)} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>)}
    </div>}</aside><section className="media-panel">{media.loading ? <Spinner label={`Loading ${title.toLowerCase()}…`} /> : media.error ? <ErrorState error={media.error} retry={media.retry} /> : !media.data?.items.length ? <Empty>No {title.toLowerCase()} found.</Empty> : <div className="poster-grid">
      {media.data.items.map((item,index) => <Focusable key={item.id} focusKey={`${kind}:item:${item.id}`} group={`${kind}-grid`} index={index} columns={5} orientation="grid" neighbors={{ left: index % 5 === 0 ? (category ? `${kind}:cat:${category}` : `${kind}:cat:all`) : undefined }} onSelect={() => open(item)} className="poster-card"><Image src={item.poster} alt={item.name} className="poster" /><strong>{item.name}</strong><small>{[item.year, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · ')}</small></Focusable>)}
    </div>}</section></div>
  </main>;
}
