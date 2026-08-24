import { useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, ErrorState, Image, Spinner } from '../components/common';
import { SearchField } from '../components/SearchField';
import { useAsync } from '../hooks/useAsync';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import { PREVIOUS_FOCUS } from '../navigation/FocusManager';
import type { SeriesItem, VodItem } from '../types';

type Props = { kind: 'movies'|'series'; open: (item: VodItem | SeriesItem) => void };
export function MediaCatalog({ kind, open }: Props) {
  const t = useTranslate();
  const isMovie = kind === 'movies'; const [category, setCategory] = useState(''); const [search, setSearch] = useState('');
  const categories = useAsync(isMovie ? api.vodCategories : api.seriesCategories, [kind]);
  const media = useAsync(() => isMovie ? api.vod(category || undefined, 0, search) : api.series(category || undefined, 0, search), [kind, category, search]);
  // Each kind carries its own strings: "all"/"none found" inflect with the noun's gender in some languages.
  const title = t(`catalog.${kind}.title`);
  const firstItemKey = media.data?.items[0] ? `${kind}:item:${media.data.items[0].id}` : undefined;
  const categoryKey = category ? `${kind}:cat:${category}` : `${kind}:cat:all`;
  const searchKey = `${kind}:search`;
  return <main className="screen catalog-screen"><header className="section-header"><div><span className="eyebrow">{t('catalog.eyebrow')}</span><h1>{title}</h1></div><SearchField focusKey={searchKey} value={search} input={setSearch} placeholder={t(`catalog.${kind}.search`)} neighbors={{ down: [PREVIOUS_FOCUS, firstItemKey || categoryKey] }} /></header>
    <div className="media-layout"><aside className="category-panel"><h2>{t('common.categories')}</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list">
      <Focusable focusKey={`${kind}:cat:all`} group={`${kind}-cats`} index={0} orientation="vertical" neighbors={{ right: firstItemKey, up: searchKey }} onSelect={() => setCategory('')} className={!category ? 'active-item' : ''}>{t(`catalog.${kind}.all`)}</Focusable>
      {categories.data?.map((item,index) => <Focusable key={item.id} focusKey={`${kind}:cat:${item.id}`} group={`${kind}-cats`} index={index+1} orientation="vertical" neighbors={{ right: firstItemKey }} onSelect={() => setCategory(item.id)} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>)}
    </div>}</aside><section className="media-panel">{media.loading ? <Spinner label={t(`catalog.${kind}.loading`)} /> : media.error ? <ErrorState error={media.error} retry={media.retry} /> : !media.data?.items.length ? <Empty>{t(`catalog.${kind}.empty`)}</Empty> : <div className="poster-grid">
      {media.data.items.map((item,index) => <Focusable key={item.id} focusKey={`${kind}:item:${item.id}`} group={`${kind}-grid`} index={index} columns={5} orientation="grid" neighbors={{ left: index % 5 === 0 ? categoryKey : undefined, up: index < 5 ? searchKey : undefined }} onSelect={() => open(item)} className="poster-card"><Image src={item.poster} alt={item.name} className="poster" /><strong>{item.name}</strong><small>{[item.year, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · ')}</small></Focusable>)}
    </div>}</section></div>
  </main>;
}
