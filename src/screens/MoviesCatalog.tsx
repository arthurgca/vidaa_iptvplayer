import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Image } from '../components/common';
import { SearchField } from '../components/SearchField';
import { useAsync } from '../hooks/useAsync';
import type { CatalogQuery } from '../hooks/useCatalogPage';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import type { ScrollPosition } from '../navigation/scroll';
import { remoteAction, type RemoteAction } from '../platform/remote';
import type { MovieSort, Page, VodItem } from '../types';

const COLUMNS = 6;
const WINDOW_SIZE = 120;
const CATEGORIES = 'movies:categories';
const SEARCH = 'movies:search';
const SORT = 'movies:sort';
const SORTS: MovieSort[] = ['title-asc', 'title-desc', 'added-desc', 'added-asc', 'release-desc', 'release-asc', 'rating-desc', 'rating-asc'];
const RETRY = 'movies:retry';
const keyFor = (id: string) => `movies:item:${encodeURIComponent(id)}`;
type View = { key: string; pages: Page<VodItem>[]; total: number; index: number; top: number; start: number; end: number; focus: boolean };
type Props = { query: CatalogQuery; setQuery: (query: CatalogQuery) => void; restoreFocus?: string; scroll?: ScrollPosition[]; open: (item: VodItem) => void };

function visibleWindow(index: number, total: number, row: number, height: number, currentTop: number) {
  const rowTop = Math.floor(index / COLUMNS) * row;
  const maxTop = Math.max(0, Math.ceil(total / COLUMNS) * row + 24 - height);
  let top = currentTop;
  if (rowTop < top || rowTop + row + 24 > top + height) top = rowTop < top ? rowTop : rowTop + row + 24 - height;
  top = Math.max(0, Math.min(top, maxTop));
  return { top, start: Math.max(0, Math.floor(top / row) - 1) * COLUMNS,
    end: Math.min(total, (Math.ceil((top + height) / row) + 1) * COLUMNS) };
}

function MovieTile({ item, index, rowHeight, choose, highlight }: { item: VodItem; index: number; rowHeight: number; choose: () => void; highlight: () => void }) {
  const focus = useFocusManager(); const ref = useRef<HTMLButtonElement>(null);
  const select = useRef(choose); select.current = choose;
  useLayoutEffect(() => {
    const element = ref.current!;
    focus.register({ key: keyFor(item.id), group: 'movies-grid', index, columns: COLUMNS, orientation: 'grid', autoFocus: false, element, onSelect: () => select.current() });
    return () => focus.unregister(keyFor(item.id), element);
  }, [item.id, index, focus]);
  const year = /^\d{4}$/.test(item.year || '') ? item.year : undefined;
  const rating = Number(item.rating); const meta = [year, rating > 0 && rating <= 10 ? `★ ${rating}` : undefined].filter(Boolean).join(' · ');
  return <button ref={ref} type="button" tabIndex={-1} className="focusable poster-card movie-card" data-movie-index={index} title={item.name}
    style={{ position: 'absolute', top: Math.floor(index / COLUMNS) * rowHeight + 12, left: `calc(${index % COLUMNS} * (100% + var(--movie-gap)) / ${COLUMNS})` }}
    onFocus={highlight} onClick={() => { focus.focus(keyFor(item.id)); choose(); }}>
    <Image src={item.poster} alt={item.name} className="movie-poster" /><strong>{item.name}</strong><small>{meta || '\u00a0'}</small>
  </button>;
}

/** Logical focus survives DOM virtualization and asynchronous local catalog windows. */
export function MoviesCatalog({ query, setQuery, restoreFocus, scroll, open }: Props) {
  const t = useTranslate(); const focus = useFocusManager(); const viewport = useRef<HTMLDivElement>(null);
  const categories = useAsync(api.vodCategories, []);
  const [search, setSearch] = useState(query.search);
  const [geometry, setGeometry] = useState({ row: 330, height: 450 });
  const [view, setView] = useState<View>(); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [panel, setPanel] = useState<'categories' | 'sort'>(); const [panelIndex, setPanelIndex] = useState(0);
  const panelCursor = useRef(panelIndex); panelCursor.current = panelIndex;
  const [selected, setSelected] = useState<VodItem>();
  const destination = useRef(query.offset); const cursor = useRef(query.offset); const sequence = useRef(0);
  const restoring = useRef(true); const pendingFocus = useRef(false); const alive = useRef(true);
  const geometryRef = useRef(geometry); geometryRef.current = geometry;
  const queryRef = useRef(query); queryRef.current = query;
  const sort = query.sort || 'added-desc';
  const filterKey = JSON.stringify([query.category, search, sort]);
  const saveCursor = (index: number, item: VodItem) => {
    cursor.current = index; destination.current = index; setSelected(item);
    if (queryRef.current.offset !== index) setQuery({ ...queryRef.current, offset: index });
  };

  useEffect(() => { const timer = window.setTimeout(() => setSearch(query.search), 250); return () => clearTimeout(timer); }, [query.search]);
  useLayoutEffect(() => {
    const measure = () => {
      const element = viewport.current; if (!element?.clientWidth) return;
      const font = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = (element.clientWidth - 24 - (COLUMNS - 1) * font) / COLUMNS;
      setGeometry({ row: Math.ceil(width * 1.5 + font * 5.2), height: element.clientHeight });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    if (viewport.current) observer?.observe(viewport.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const load = async (index: number, takeFocus: boolean, anchor = '', savedTop?: number) => {
    const request = ++sequence.current; destination.current = index; pendingFocus.current = takeFocus;
    const category = query.category; const term = search; const key = filterKey;
    setBusy(true); setError('');
    try {
      const first = await api.movieWindow(category, Math.floor(Math.max(0, index) / WINDOW_SIZE) * WINDOW_SIZE, term, anchor, sort);
      if (!alive.current || request !== sequence.current) return;
      const anchored = anchor ? first.items.findIndex(item => item.id === anchor) : -1;
      index = anchored >= 0 ? first.offset + anchored : Math.max(0, Math.min(index, first.total - 1));
      const { row, height } = geometryRef.current;
      const { top, start, end } = visibleWindow(index, first.total, row, height, savedTop ?? viewport.current?.scrollTop ?? 0);
      const offsets = new Set<number>();
      for (let offset = Math.floor(start / WINDOW_SIZE) * WINDOW_SIZE; offset < end; offset += WINDOW_SIZE) offsets.add(offset);
      const pages = await Promise.all([...offsets].map(offset => offset === first.offset ? first : api.movieWindow(category, offset, term, '', sort)));
      if (!alive.current || request !== sequence.current) return;
      destination.current = index; cursor.current = index;
      setView({ key, pages, total: first.total, index, top, start, end, focus: takeFocus }); setBusy(false);
      if (!first.total && focus.focused.startsWith('movies:item:')) focus.focus(SEARCH);
    } catch {
      if (!alive.current || request !== sequence.current) return;
      setError(t('movies.unavailable')); setBusy(false);
      if (focus.focused !== SEARCH && !focus.focus(focus.focused)) focus.focus(RETRY) || focus.focus(CATEGORIES);
    }
  };
  const loadRef = useRef(load); loadRef.current = load;

  useEffect(() => {
    const initial = restoring.current; restoring.current = false;
    const anchor = initial && restoreFocus?.startsWith('movies:item:') ? decodeURIComponent(restoreFocus.slice('movies:item:'.length)) : '';
    const savedTop = initial ? scroll?.find(position => position.key === 'movies:grid')?.top : 0;
    setSelected(undefined);
    if (initial) focus.focus(restoreFocus === SEARCH ? SEARCH : CATEGORIES);
    else if (focus.focused !== SEARCH && !focus.focus(focus.focused)) focus.focus(CATEGORIES);
    void loadRef.current(initial ? query.offset : 0, initial || focus.focused !== SEARCH, anchor, savedTop);
  }, [filterKey]);
  useEffect(() => {
    if (view?.key === filterKey) void loadRef.current(cursor.current, focus.focused.startsWith('movies:item:'));
  }, [geometry.row, geometry.height]);
  useEffect(() => () => { alive.current = false; sequence.current++; focus.setScope('root'); }, []);

  useLayoutEffect(() => {
    if (!view || view.key !== filterKey) return;
    if (viewport.current) viewport.current.scrollTop = view.top;
    let item: VodItem | undefined;
    for (const page of view.pages) if (view.index >= page.offset && view.index < page.offset + page.items.length) item = page.items[view.index - page.offset];
    if (item) {
      setSelected(item);
      // Preact runs the parent's layout effect before registering child tiles.
      // A microtask lets all registrations finish without delaying remote navigation a frame.
      if (view.focus && pendingFocus.current && focus.focused !== SEARCH && !panel) {
        const request = sequence.current;
        void Promise.resolve().then(() => { if (alive.current && request === sequence.current && focus.focused !== SEARCH) focus.focus(keyFor(item!.id)); });
      }
    }
    pendingFocus.current = false;
  }, [view]);

  useEffect(() => {
    if (!panel) return;
    focus.setScope('movies:selector');
    const timer = window.setTimeout(() => { focus.focus(`movies:selector:${panelCursor.current}`) || focus.focus('movies:selector:close'); }, 50);
    return () => { clearTimeout(timer); focus.setScope('root'); };
  }, [panel, categories.loading, categories.error]);
  const closePanel = () => { focus.setScope('root'); setPanel(undefined); focus.focus(panel === 'sort' ? SORT : CATEGORIES); };
  const showPanel = () => {
    const index = (categories.data?.findIndex(item => item.id === query.category) ?? -1) + 1;
    setPanelIndex(index); setPanel('categories');
  };
  const changeCategory = (category: string) => {
    closePanel();
    if (category === query.category) { void loadRef.current(cursor.current, true); return; }
    setQuery({ ...queryRef.current, category, offset: 0 });
  };
  const changeSort = (value: MovieSort) => {
    closePanel();
    if (value === sort) { void loadRef.current(cursor.current, true); return; }
    setQuery({ ...queryRef.current, sort: value, offset: 0 });
  };
  const navigate = (index: number) => {
    if (!view?.total || view.key !== filterKey) return;
    index = Math.max(0, Math.min(index, view.total - 1));
    if (index === cursor.current && !busy) {
      const page = view.pages.find(page => index >= page.offset && index < page.offset + page.items.length);
      const item = page?.items[index - page.offset]; if (item) { focus.focus(keyFor(item.id)); return; }
    }
    const range = visibleWindow(index, view.total, geometry.row, geometry.height, viewport.current?.scrollTop || 0);
    const covered = (offset: number) => view.pages.some(page => offset >= page.offset && offset < page.offset + page.items.length);
    if (covered(range.start) && covered(range.end - 1)) {
      // Moving inside a loaded window does no fetching, filtering or promise work.
      sequence.current++; destination.current = index; pendingFocus.current = true;
      setView({ ...view, ...range, index, focus: true }); setBusy(false); setError('');
    } else void loadRef.current(index, true);
  };
  const handle = (action: RemoteAction) => {
    const current = focus.focused;
    if (panel) {
      if (action === 'BACK') { closePanel(); return true; }
      if (action === 'SELECT') { focus.select(); return true; }
      if (action.startsWith('NAV_') || action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') {
        const step = action === 'NAV_UP' ? -1 : action === 'NAV_DOWN' ? 1 : action === 'CHANNEL_UP' ? -7 : action === 'CHANNEL_DOWN' ? 7 : 0;
        const last = panel === 'sort' ? SORTS.length - 1 : categories.error ? 1 : categories.data?.length || 0;
        const index = Math.max(-1, Math.min(panelIndex + step, last));
        setPanelIndex(index); focus.focus(index < 0 ? 'movies:selector:close' : panel === 'categories' && categories.error && index === 1 ? 'movies:selector:retry' : `movies:selector:${index}`); return true;
      }
      return true;
    }
    if (action === 'BACK') return false;
    if (action === 'SELECT') { focus.select(); return true; }
    if (action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') {
      const rows = Math.max(1, Math.floor(geometry.height / geometry.row));
      navigate(destination.current + (action === 'CHANNEL_UP' ? -1 : 1) * rows * COLUMNS); return true;
    }
    if (!action.startsWith('NAV_')) return false;
    if (!current.startsWith('movies:item:')) {
      if (action === 'NAV_LEFT') focus.focus(current === SEARCH ? SORT : CATEGORIES);
      else if (action === 'NAV_RIGHT') focus.focus(current === CATEGORIES ? SORT : SEARCH);
      else if (action === 'NAV_UP' && current === RETRY) focus.focus(SEARCH);
      else if (action === 'NAV_DOWN') { if (error) focus.focus(RETRY); else navigate(cursor.current); }
      return true;
    }
    const index = destination.current; const column = index % COLUMNS;
    if (action === 'NAV_UP' && index < COLUMNS) focus.focus(column < 2 ? CATEGORIES : column < 4 ? SORT : SEARCH);
    else if (action === 'NAV_LEFT' && column > 0) navigate(index - 1);
    else if (action === 'NAV_RIGHT' && column < COLUMNS - 1 && index + 1 < (view?.total || 0)) navigate(index + 1);
    else if (action === 'NAV_UP') navigate(index - COLUMNS);
    else if (action === 'NAV_DOWN' && index + COLUMNS < Math.ceil((view?.total || 0) / COLUMNS) * COLUMNS) navigate(index + COLUMNS);
    return true;
  };
  const handler = useRef(handle); handler.current = handle;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const action = remoteAction(event); if (!action) return;
      if (event.target instanceof HTMLInputElement) {
        // The app maps Backspace to Back outside editing. Keep deletion native inside Movies search.
        if (action === 'BACK' && (event.key === 'Backspace' || event.keyCode === 8)) { event.stopImmediatePropagation(); return; }
        if (action === 'SELECT' || action === 'BACK' && event.key !== 'Backspace') {
          event.preventDefault(); event.stopImmediatePropagation(); event.target.blur(); focus.focus(SEARCH); setSearch(queryRef.current.search);
        }
        return;
      }
      if (handler.current(action)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, []);

  const currentView = view?.key === filterKey ? view : undefined;
  const loading = busy || !currentView && !error;
  const visible: Array<{ item: VodItem; index: number }> = [];
  currentView?.pages.forEach(page => page.items.forEach((item, i) => { const index = page.offset + i; if (index >= currentView.start && index < currentView.end) visible.push({ item, index }); }));
  const categoryName = categories.data?.find(item => item.id === query.category)?.name || (query.category || t('catalog.movies.all'));
  return <main className="screen movies-browser">
    <div className="movies-background" aria-hidden={panel ? 'true' : undefined}>
      <header className="section-header"><div><span className="eyebrow">{t('catalog.eyebrow')}</span><h1>{t('catalog.movies.title')}</h1></div>
        <Focusable hoverFocus={false} focusKey={CATEGORIES} group="movies-header" index={0} onSelect={showPanel} className="movies-category-control"><small>{t('common.categories')}</small><strong>{categoryName}</strong><span aria-hidden="true">⌄</span></Focusable>
        <Focusable hoverFocus={false} focusKey={SORT} group="movies-header" index={1} onSelect={() => { setPanelIndex(SORTS.indexOf(sort)); setPanel('sort'); }} className="movies-category-control movies-sort-control"><small>{t('movies.sort')}</small><strong>{t(`movies.sort.${sort}`)}</strong><span aria-hidden="true">⌄</span></Focusable>
        <SearchField focusKey={SEARCH} value={query.search} input={value => setQuery({ ...queryRef.current, search: value, offset: 0 })} placeholder={t('movies.searchScope', { category: categoryName })} />
      </header>
      <div className="movies-context"><strong>{selected?.name || categoryName}</strong><span role="status">{loading ? t('catalog.movies.loading') : error ? '' : t('movies.count', { count: currentView?.total.toLocaleString() || '0' })}</span></div>
      <div className="movies-grid" ref={viewport} data-scroll-key="movies:grid" role="region" aria-label={t('catalog.movies.title')} aria-busy={loading}
        style={{ '--movie-row': `${geometry.row}px` }} onWheel={event => { event.preventDefault(); navigate(destination.current + Math.sign(event.deltaY) * COLUMNS); }}>
        <div className="movies-grid-content" style={{ height: currentView?.total ? Math.ceil(currentView.total / COLUMNS) * geometry.row + 24 : '100%' }}>
          {visible.map(({ item, index }) => <MovieTile key={item.id} item={item} index={index} rowHeight={geometry.row} highlight={() => saveCursor(index, item)} choose={() => open(item)} />)}
          {!currentView && !error && <div className="state-panel"><span className="spinner" /><p>{t('catalog.movies.loading')}</p></div>}
          {currentView?.total === 0 && !error && <div className="state-panel"><h2>{t('catalog.movies.empty')}</h2><p>{t('movies.emptyHint', { category: categoryName })}</p></div>}
        </div>
      </div>
      {error && <div className="movies-error" role="alert"><span>{error}</span><Focusable hoverFocus={false} focusKey={RETRY} group="movies-status" index={0} onSelect={() => void loadRef.current(destination.current, true)} className="secondary-button">{t('common.retry')}</Focusable></div>}
    </div>
    {panel && <div className="movies-modal"><section className="movies-category-dialog" role="dialog" aria-modal="true" aria-label={t(panel === 'sort' ? 'movies.sort' : 'common.categories')}>
      <header><div><span className="eyebrow">{t('catalog.movies.title')}</span><h2>{t(panel === 'sort' ? 'movies.sort' : 'common.categories')}</h2></div><Focusable hoverFocus={false} focusKey="movies:selector:close" group="movies-selector" index={-1} onFocus={() => setPanelIndex(-1)} onSelect={closePanel}>{t('common.back')}</Focusable></header>
      <div className="movies-category-options">
        {panel === 'sort' ? SORTS.map((value, i) => <Focusable hoverFocus={false} key={value} focusKey={`movies:selector:${i}`} group="movies-selector" index={i} onFocus={() => setPanelIndex(i)} onSelect={() => changeSort(value)} className={sort === value ? 'selected-category' : ''}>{sort === value ? '✓ ' : ''}{t(`movies.sort.${value}`)}</Focusable>) : <>
        <Focusable hoverFocus={false} focusKey="movies:selector:0" group="movies-selector" index={0} onSelect={() => changeCategory('')} onFocus={() => setPanelIndex(0)} className={!query.category ? 'selected-category' : ''}>{!query.category ? '✓ ' : ''}{t('catalog.movies.all')}</Focusable>
        {categories.data?.map((category, i) => <Focusable hoverFocus={false} key={`${category.id}:${i}`} focusKey={`movies:selector:${i + 1}`} group="movies-selector" index={i + 1} onFocus={() => setPanelIndex(i + 1)} onSelect={() => changeCategory(category.id)} className={category.id === query.category ? 'selected-category' : ''}>{category.id === query.category ? '✓ ' : ''}{category.name}</Focusable>)}
        {categories.loading && <p>{t('common.loading')}</p>}
        {categories.error && <div className="error"><p>{t('movies.categoriesUnavailable')}</p><Focusable hoverFocus={false} focusKey="movies:selector:retry" group="movies-selector" index={1} onSelect={categories.retry}>{t('common.retry')}</Focusable></div>}
        </>}
      </div><p className="movies-category-hint">{t(panel === 'sort' ? 'movies.sortHint' : 'movies.categoryHint')}</p>
    </section></div>}
  </main>;
}
