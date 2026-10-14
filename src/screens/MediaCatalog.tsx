import { api } from '../api/client';
import { Empty, ErrorState, Image, Spinner } from '../components/common';
import { CatalogPagination } from '../components/CatalogPagination';
import { SearchField } from '../components/SearchField';
import { useAsync } from '../hooks/useAsync';
import { useCatalogPage, filterCatalog, type CatalogQuery } from '../hooks/useCatalogPage';
import { useCatalogFocus } from '../hooks/useCatalogFocus';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import { PREVIOUS_FOCUS } from '../navigation/FocusManager';
import type { SeriesItem, VodItem } from '../types';
import { catalogCategoryFocusKey, catalogItemFocusKey } from './catalogFocus';

type Props = { kind: 'movies'|'series'; query: CatalogQuery; setQuery: (query: CatalogQuery) => void; restoreFocus?: string; open: (item: VodItem | SeriesItem) => void };
export function MediaCatalog({ kind, query, setQuery, restoreFocus, open }: Props) {
  const t = useTranslate();
  const isMovie = kind === 'movies'; const { category, search, offset } = query;
  const setCategory = (value: string) => setQuery(filterCatalog(query, { category: value }));
  const setSearch = (value: string) => setQuery(filterCatalog(query, { search: value }));
  const categories = useAsync(isMovie ? api.vodCategories : api.seriesCategories, [kind]);
  const media = useCatalogPage(() => isMovie ? api.vod(category || undefined, offset, search) : api.series(category || undefined, offset, search), kind, query);
  // Each kind carries its own strings: "all"/"none found" inflect with the noun's gender in some languages.
  const title = t(`catalog.${kind}.title`);
  const items = media.data?.items || [];
  const firstItemKey = items[0] ? catalogItemFocusKey(kind, category, items[0].id, offset) : undefined;
  const lastItem = items[items.length - 1];
  const lastItemKey = lastItem ? catalogItemFocusKey(kind, category, lastItem.id, offset + items.length - 1) : undefined;
  const selectedCategoryIndex = categories.data?.findIndex((item) => item.id === category) ?? -1;
  const categoryKey = category && selectedCategoryIndex >= 0 ? catalogCategoryFocusKey(kind, category, selectedCategoryIndex) : `${kind}:cat:all`;
  const searchKey = `${kind}:search`;
  const contentKey = firstItemKey || (media.error ? `${kind}:retry` : offset ? `${kind}:page:previous` : undefined);
  const pageNeighbors = [`${kind}:page:next`, `${kind}:page:previous`];
  useCatalogFocus(kind, media.loading, firstItemKey, media.error ? `${kind}:retry` : categoryKey, restoreFocus);
  return <main className="screen catalog-screen"><header className="section-header"><div><span className="eyebrow">{t('catalog.eyebrow')}</span><h1>{title}</h1></div><SearchField focusKey={searchKey} value={search} input={setSearch} placeholder={t(`catalog.${kind}.search`)} neighbors={{ down: [PREVIOUS_FOCUS, firstItemKey || categoryKey] }} /></header>
    <div className="media-layout"><aside className="category-panel"><h2>{t('common.categories')}</h2>{categories.loading ? <Spinner /> : categories.error ? <ErrorState error={categories.error} retry={categories.retry} /> : <div className="category-list">
      <Focusable focusKey={`${kind}:cat:all`} group={`${kind}-cats`} index={0} orientation="vertical" neighbors={{ right: contentKey, up: searchKey }} onSelect={() => setCategory('')} className={!category ? 'active-item' : ''}>{t(`catalog.${kind}.all`)}</Focusable>
      {categories.data?.map((item,index) => { const focusKey = catalogCategoryFocusKey(kind, item.id, index); return <Focusable key={focusKey} focusKey={focusKey} group={`${kind}-cats`} index={index+1} orientation="vertical" neighbors={{ right: contentKey }} onSelect={() => setCategory(item.id)} className={category === item.id ? 'active-item' : ''}>{item.name}</Focusable>; })}
    </div>}</aside><section className="media-panel">{media.loading ? <Spinner label={t(`catalog.${kind}.loading`)} /> : media.error ? <div className="state-panel error"><p>{media.error}</p><Focusable focusKey={`${kind}:retry`} group={`${kind}-status`} index={0} neighbors={{ left: categoryKey, up: searchKey, down: offset ? `${kind}:page:previous` : undefined }} onSelect={media.retry} className="secondary-button">{t('common.retry')}</Focusable></div> : !items.length ? <Empty>{t(`catalog.${kind}.empty`)}</Empty> : <div className="poster-grid">
      {items.map((item,index) => { const focusKey = catalogItemFocusKey(kind, category, item.id, offset + index); return <Focusable key={focusKey} focusKey={focusKey} group={`${kind}-grid`} index={index} columns={5} orientation="grid" neighbors={{ left: index % 5 === 0 ? categoryKey : undefined, up: index < 5 ? searchKey : undefined, down: index + 5 >= items.length ? pageNeighbors : undefined }} onSelect={() => open(item)} className="poster-card"><Image src={item.poster} alt={item.name} className="poster" /><strong>{item.name}</strong><small>{[item.year, item.rating && `★ ${item.rating}`].filter(Boolean).join(' · ')}</small></Focusable>; })}
    </div>}
      <CatalogPagination kind={kind} page={media.data} offset={offset} pageSize={60} loading={media.loading} change={(value) => setQuery({ ...query, offset: value })} firstItem={firstItemKey} lastItem={lastItemKey} fallback={categoryKey} />
    </section></div>
  </main>;
}
