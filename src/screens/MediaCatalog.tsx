import { useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, ErrorState, Spinner } from '../components/common';
import { CatalogPagination } from '../components/CatalogPagination';
import { SearchField } from '../components/SearchField';
import { MediaRows, type MediaRow } from '../components/MediaRows';
import { useAsync } from '../hooks/useAsync';
import { useCatalogPage, filterCatalog, type CatalogQuery } from '../hooks/useCatalogPage';
import { useCatalogFocus } from '../hooks/useCatalogFocus';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import { PREVIOUS_FOCUS } from '../navigation/FocusManager';
import type { ScrollPosition } from '../navigation/scroll';
import type { SeriesItem, VodItem } from '../types';
import { catalogCategoryFocusKey, catalogItemFocusKey } from './catalogFocus';
import { MoviesCatalog } from './MoviesCatalog';

type Props = { kind: 'movies'|'series'; query: CatalogQuery; setQuery: (query: CatalogQuery) => void; restoreFocus?: string; scroll?: ScrollPosition[]; open: (item: VodItem | SeriesItem) => void };
export function MediaCatalog({ kind, query, setQuery, restoreFocus, scroll, open }: Props) {
  if (kind === 'movies') return <MoviesCatalog query={query} setQuery={setQuery} restoreFocus={restoreFocus} scroll={scroll} open={open} />;
  return <PagedMediaCatalog kind={kind} query={query} setQuery={setQuery} restoreFocus={restoreFocus} scroll={scroll} open={open} />;
}
function PagedMediaCatalog({ kind, query, setQuery, restoreFocus, scroll, open }: Props) {
  const t = useTranslate(); const [selected, setSelected] = useState<VodItem | SeriesItem>();
  const isMovie = kind === 'movies'; const { category, search, offset } = query;
  const setCategory = (value: string) => { setSelected(undefined); setQuery(filterCatalog(query, { category: value })); };
  const setSearch = (value: string) => { setSelected(undefined); setQuery(filterCatalog(query, { search: value })); };
  const categories = useAsync(isMovie ? api.vodCategories : api.seriesCategories, [kind]);
  const media = useCatalogPage(() => isMovie ? api.vod(category || undefined, offset, search) : api.series(category || undefined, offset, search), kind, query);
  const items = media.data?.items || [];
  const firstItemKey = items[0] ? catalogItemFocusKey(kind, category, items[0].id, offset) : undefined;
  const selectedCategoryIndex = categories.data?.findIndex((item) => item.id === category) ?? -1;
  const categoryKey = category && selectedCategoryIndex >= 0 ? catalogCategoryFocusKey(kind, category, selectedCategoryIndex) : `${kind}:cat:all`;
  const searchKey = `${kind}:search`;
  const contentKey = firstItemKey || (media.error ? `${kind}:retry` : offset ? `${kind}:page:previous` : searchKey);
  const pageNeighbors = [`${kind}:page:next`, `${kind}:page:previous`];
  const grouped = new Map<string, MediaRow>();
  items.forEach((item, index) => {
    const id = item.categoryId || 'all';
    if (!grouped.has(id)) grouped.set(id, { id, title: categories.data?.find((c) => c.id === id)?.name || t(`catalog.${kind}.all`), cards: [] });
    grouped.get(id)!.cards.push({ key: catalogItemFocusKey(kind, category, item.id, offset + index), title: item.name, image: item.poster,
      subtitle: [item.year, item.genre, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · '), select: () => open(item) });
  });
  const rows = [...grouped.values()];
  const lastRow = rows[rows.length - 1]; const lastItemKey = lastRow?.cards[lastRow.cards.length - 1]?.key;
  useCatalogFocus(kind, media.loading, firstItemKey, media.error ? `${kind}:retry` : categoryKey, restoreFocus, scroll);
  const current = selected && items.some((item) => item === selected) ? selected : items[0];
  return <main className="screen catalog-screen library-browser"><header className="section-header"><div><span className="eyebrow">{t('catalog.eyebrow')}</span><h1>{t(`catalog.${kind}.title`)}</h1></div><SearchField focusKey={searchKey} value={search} input={setSearch} placeholder={t(`catalog.${kind}.search`)} neighbors={{ down: [PREVIOUS_FOCUS, firstItemKey || categoryKey] }} /></header>
    <div className="media-layout"><aside className="category-panel"><h2>{t('common.categories')}</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list" data-scroll-key={`${kind}:categories`}>
      <Focusable focusKey={`${kind}:cat:all`} group={`${kind}-cats`} index={0} orientation="vertical" neighbors={{ right: contentKey, left: `${kind}:cat:all`, up: searchKey }} onSelect={() => setCategory('')} className={!category ? 'active-item' : ''}>{t(`catalog.${kind}.all`)}</Focusable>
      {categories.data?.map((item,index) => { const focusKey = catalogCategoryFocusKey(kind, item.id, index); return <Focusable key={focusKey} focusKey={focusKey} group={`${kind}-cats`} index={index+1} orientation="vertical" neighbors={{ right: contentKey, left: focusKey, down: index === categories.data!.length - 1 ? focusKey : undefined }} onSelect={() => setCategory(item.id)} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>; })}
    </div>}</aside><section className="media-panel">
      {current && <div className="selection-summary"><strong>{current.name}</strong><span>{[current.year, current.duration, current.genre, current.rating && `★ ${current.rating}`].filter(Boolean).join(' · ')}</span><p>{current.description || t('details.noDescription')}</p></div>}
      {media.loading ? <Spinner label={t(`catalog.${kind}.loading`)} /> : media.error ? <div className="state-panel error"><p>{media.error}</p><Focusable focusKey={`${kind}:retry`} group={`${kind}-status`} index={0} neighbors={{ left: categoryKey, up: searchKey, down: offset ? `${kind}:page:previous` : undefined }} onSelect={media.retry} className="secondary-button">{t('common.retry')}</Focusable></div> : !items.length ? <Empty>{t(`catalog.${kind}.empty`)}</Empty> : <MediaRows rows={rows} scope={kind} top={searchKey} bottom={media.data && offset + items.length < media.data.total ? pageNeighbors : offset ? [`${kind}:page:previous`] : undefined} left={categoryKey} highlight={(card) => setSelected(items.find((item, index) => catalogItemFocusKey(kind, category, item.id, offset + index) === card.key))} />}
      <CatalogPagination kind={kind} page={media.data} offset={offset} pageSize={60} loading={media.loading} change={(value) => { setSelected(undefined); setQuery({ ...query, offset: value }); }} firstItem={firstItemKey} lastItem={lastItemKey} fallback={categoryKey} />
    </section></div>
  </main>;
}
