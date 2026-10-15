import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { isEpgFresh, loadEpg, peekEpg, programProgress } from '../api/epg';
import { Empty, formatTime, Image, Progress, Spinner } from '../components/common';
import { SearchField } from '../components/SearchField';
import { useAsync } from '../hooks/useAsync';
import type { CatalogQuery } from '../hooks/useCatalogPage';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import type { ScrollPosition } from '../navigation/scroll';
import { remoteAction, type RemoteAction } from '../platform/remote';
import type { Channel, EpgNow, Favorite, Program } from '../types';

interface LiveTVProps {
  query: CatalogQuery; setQuery: (query: CatalogQuery) => void;
  restoreFocus?: string; scroll?: ScrollPosition[]; lastTuned?: string;
  guide: () => void; play: (channel: Channel, channels: Channel[]) => void;
}
const CATEGORIES = 'live:categories', SEARCH = 'live:search', GUIDE = 'live:guide', FAVORITE = 'live:favorite';
const keyFor = (id: string) => `live:channel:${id}`;
const validProgram = (p: Program | undefined): p is Program => Boolean(p?.title?.trim() && !/^(no programmes?|no programs?|no programme information)[.!]?$/i.test(p.title.trim()) && Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start);

function ChannelRow({ channel, index, number, rowHeight, selected, tuned, favorite, highlight, play }: {
  channel: Channel; index: number; number: number; rowHeight: number; selected: boolean; tuned: boolean; favorite: boolean; highlight: () => void; play: () => void;
}) {
  const focus = useFocusManager(); const element = useRef<HTMLButtonElement>(null);
  const activate = useRef(play); activate.current = play;
  const t = useTranslate();
  useLayoutEffect(() => {
    const node = element.current!;
    focus.register({ key: keyFor(channel.id), group: 'live-channels', index, orientation: 'vertical', autoFocus: false,
      neighbors: { left: CATEGORIES, right: FAVORITE, up: index === 0 ? CATEGORIES : undefined }, element: node, onSelect: () => activate.current() });
    return () => focus.unregister(keyFor(channel.id), node);
  }, [channel.id, index, focus]);
  return <button ref={element} type="button" tabIndex={-1} data-channel-id={channel.id} aria-label={`${number} ${channel.name}`} aria-current={selected ? 'true' : undefined}
    className={`focusable channel-row${selected ? ' selected-row' : ''}`} style={{ top: index * rowHeight + 8, height: rowHeight - 8 }}
    onFocus={highlight} onClick={() => { focus.focus(keyFor(channel.id)); play(); }}>
    <span className="channel-number">{number}</span><Image src={channel.logo} alt={channel.name} className="channel-logo" />
    <span className="channel-copy"><strong>{channel.name}</strong></span>
    {favorite && <span className="channel-star" aria-label={t('favorite.short')}>★</span>}
    {tuned && <span className="tuned-badge"><small>{t('live.lastTuned')}</small></span>}
  </button>;
}

export function LiveTV({ query, setQuery, restoreFocus, scroll, lastTuned, play, guide }: LiveTVProps) {
  const t = useTranslate(); const focus = useFocusManager();
  const categories = useAsync(api.liveCategories, []); const catalog = useAsync(api.liveCatalog, []);
  const viewport = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ row: 64, height: 400 });
  const [top, setTop] = useState(0); const [selected, setSelected] = useState<Channel>();
  const [panel, setPanel] = useState(false); const [panelIndex, setPanelIndex] = useState(0);
  const [programme, setProgramme] = useState<{ id: string; value?: EpgNow; loading: boolean }>();
  const [now, setNow] = useState(Date.now());
  const [favorites, setFavorites] = useState<Favorite[]>([]); const [saving, setSaving] = useState(false); const [favoriteError, setFavoriteError] = useState('');
  const cursor = useRef(0), selectedId = useRef<string>(), initial = useRef(true), pendingFocus = useRef(false), alive = useRef(true), revision = useRef(0);
  const panelReturn = useRef(CATEGORIES); const panelCursor = useRef(0);
  const queryRef = useRef(query); queryRef.current = query;
  const unsearched = useRef<{ id?: string; top: number }>();
  const previousFilter = useRef({ category: query.category, search: query.search });
  const index = useMemo(() => {
    const all: Channel[] = [], byCategory = new Map<string, Channel[]>(), positions = new Map<string, number>(), names = new Map<string, string>();
    for (const channel of catalog.data || []) {
      if (positions.has(channel.id)) continue;
      positions.set(channel.id, all.length + 1); names.set(channel.id, channel.name.toLocaleLowerCase()); all.push(channel);
      const group = byCategory.get(channel.categoryId) || []; group.push(channel); byCategory.set(channel.categoryId, group);
    }
    return { all, byCategory, positions, names };
  }, [catalog.data]);
  const rows = useMemo(() => {
    const source = query.category ? index.byCategory.get(query.category) || [] : index.all;
    const term = query.search.trim().toLocaleLowerCase();
    return term ? source.filter(channel => index.names.get(channel.id)!.includes(term)) : source;
  }, [index, query.category, query.search]);
  const favoriteIds = useMemo(() => new Set(favorites.filter(item => item.type === 'live').map(item => item.id)), [favorites]);
  const favorite = Boolean(selected && favoriteIds.has(selected.id));
  const saveCursor = (i: number) => {
    const channel = rows[i]; if (!channel) return;
    cursor.current = i; selectedId.current = channel.id; setSelected(channel);
    if (queryRef.current.offset !== i) { const next = { ...queryRef.current, offset: i }; queryRef.current = next; setQuery(next); }
  };
  const reveal = (i: number, takeFocus = true, savedTop?: number) => {
    if (!rows.length) { if (takeFocus) focus.focus(SEARCH); return; }
    i = Math.max(0, Math.min(rows.length - 1, i)); saveCursor(i);
    const element = viewport.current; const currentTop = savedTop ?? element?.scrollTop ?? top;
    let nextTop = currentTop; const rowTop = i * geometry.row;
    if (rowTop < currentTop) nextTop = rowTop;
    else if (rowTop + geometry.row + 8 > currentTop + geometry.height) nextTop = rowTop + geometry.row + 8 - geometry.height;
    nextTop = Math.max(0, Math.min(nextTop, Math.max(0, rows.length * geometry.row + 16 - geometry.height)));
    pendingFocus.current = takeFocus; revision.current++; setTop(nextTop);
    if (element) element.scrollTop = nextTop;
    if (takeFocus && focus.focus(keyFor(rows[i]!.id))) pendingFocus.current = false;
  };
  useLayoutEffect(() => {
    const measure = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setGeometry({ row: root * 4, height: viewport.current?.clientHeight || 400 });
    };
    measure(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    if (viewport.current) observer?.observe(viewport.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useLayoutEffect(() => {
    if (catalog.loading) return;
    const first = initial.current; initial.current = false;
    const previous = previousFilter.current;
    if (!previous.search && query.search && previous.category === query.category) unsearched.current = { id: selectedId.current, top: viewport.current?.scrollTop || top };
    const clearing = previous.search && !query.search && previous.category === query.category;
    const anchor = first && restoreFocus?.startsWith('live:channel:') ? restoreFocus.slice('live:channel:'.length) : clearing ? unsearched.current?.id : selectedId.current;
    previousFilter.current = { category: query.category, search: query.search };
    const found = rows.findIndex(channel => channel.id === anchor);
    const i = found >= 0 ? found : first && !anchor ? Math.min(query.offset, Math.max(0, rows.length - 1)) : 0;
    const savedTop = first ? scroll?.find(item => item.key === 'live:channels')?.top : clearing ? unsearched.current?.top : undefined;
    if (!rows.length) { selectedId.current = undefined; setSelected(undefined); setTop(0); if (catalog.error) focus.focus('live:retry'); else focus.focus(SEARCH); return; }
    const takeFocus = first || pendingFocus.current || focus.focused.startsWith('live:channel:');
    reveal(i, takeFocus, savedTop ?? (found < 0 ? 0 : undefined));
  }, [rows, catalog.loading, catalog.error]);
  const start = Math.max(0, Math.floor(top / geometry.row) - 2), end = Math.min(rows.length, Math.ceil((top + geometry.height) / geometry.row) + 2);
  const mounted = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  // Wheel scrolling retains the focused DOM node outside the visible buffer.
  if (focus.focused.startsWith('live:channel:') && rows[cursor.current] && !mounted.includes(cursor.current)) mounted.push(cursor.current);
  useLayoutEffect(() => {
    if (!pendingFocus.current || panel) return;
    const version = revision.current;
    void Promise.resolve().then(() => {
      if (!alive.current || version !== revision.current || !pendingFocus.current) return;
      const channel = rows[cursor.current];
      if (channel && focus.focus(keyFor(channel.id))) pendingFocus.current = false;
    });
  });
  useEffect(() => { if (rows.length) reveal(cursor.current, focus.focused.startsWith('live:channel:')); }, [geometry.row, geometry.height]);
  useEffect(() => {
    if (catalog.loading || !catalog.error) return;
    const timer = window.setTimeout(() => { focus.focus('live:retry') || focus.focus(SEARCH); }, 0);
    return () => clearTimeout(timer);
  }, [catalog.loading, catalog.error]);
  useEffect(() => () => { alive.current = false; revision.current++; focus.setScope('root'); }, []);
  useEffect(() => { let active = true; api.favorites().then(value => { if (active) setFavorites(value); }).catch(() => { if (active) setFavoriteError(t('browse.unavailable')); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true; const id = selected.id;
    const cached = peekEpg(id); setNow(Date.now()); setProgramme({ id, value: cached, loading: !isEpgFresh(id) });
    const refresh = () => {
      setNow(Date.now()); if (isEpgFresh(id)) return;
      void loadEpg(id).then(value => { if (active) { setProgramme({ id, value, loading: false }); setNow(Date.now()); } });
    };
    const delay = window.setTimeout(refresh, 160), interval = window.setInterval(refresh, 15_000);
    return () => { active = false; clearTimeout(delay); clearInterval(interval); };
  }, [selected?.id]);
  const epg = programme?.id === selected?.id ? programme : undefined;
  const current = validProgram(epg?.value?.current) && epg!.value!.current!.start <= now && epg!.value!.current!.end > now ? epg!.value!.current : undefined;
  const next = validProgram(epg?.value?.next) && epg!.value!.next!.start > now ? epg!.value!.next : undefined;
  useEffect(() => {
    const boundary = Math.min(current?.end || Infinity, next?.start || Infinity);
    if (!Number.isFinite(boundary)) return;
    const timer = window.setTimeout(() => { setNow(Date.now()); if (selected) void loadEpg(selected.id).then(value => { if (selectedId.current === selected.id) setProgramme({ id: selected.id, value, loading: false }); }); }, Math.max(1, boundary - Date.now() + 5));
    return () => clearTimeout(timer);
  }, [selected?.id, current?.end, next?.start]);
  const toggleFavorite = () => {
    if (!selected || saving) return;
    const channel = selected, remove = favorite; setSaving(true); setFavoriteError('');
    const task = remove ? api.unfavorite('live', channel.id) : api.favorite({ type: 'live', id: channel.id, item: channel });
    void task.then(() => setFavorites(value => remove ? value.filter(item => item.type !== 'live' || item.id !== channel.id) : [...value, { type: 'live', id: channel.id, item: channel, addedAt: Date.now() }]))
      .catch(() => setFavoriteError(t('browse.unavailable'))).finally(() => setSaving(false));
  };
  const closePanel = () => { focus.setScope('root'); setPanel(false); if (!focus.focus(panelReturn.current)) focus.focus(CATEGORIES); };
  const showPanel = () => { panelReturn.current = focus.focused || CATEGORIES; panelCursor.current = Math.max(0, (categories.data?.findIndex(item => item.id === query.category) ?? -1) + 1); setPanelIndex(panelCursor.current); setPanel(true); };
  const changeCategory = (category: string) => {
    focus.setScope('root'); setPanel(false); pendingFocus.current = true;
    if (category === query.category) reveal(cursor.current);
    else { focus.focus(CATEGORIES); setQuery({ ...queryRef.current, category, offset: 0 }); }
  };
  useEffect(() => {
    if (!panel) return;
    focus.setScope('live:selector');
    const timer = window.setTimeout(() => focus.focus(`live:selector:${panelCursor.current}`) || focus.focus('live:selector:0'), 0);
    return () => { clearTimeout(timer); focus.setScope('root'); };
  }, [panel, categories.loading, categories.error]);
  const handle = (action: RemoteAction) => {
    if (panel) {
      if (action === 'BACK') closePanel();
      else if (action === 'SELECT') focus.select();
      else if (action === 'NAV_UP' || action === 'NAV_DOWN' || action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') {
        const options = document.querySelector<HTMLElement>('.live-category-options');
        const step = action.startsWith('CHANNEL_') ? Math.max(1, Math.floor((options?.clientHeight || 400) / (geometry.row * .8))) : 1;
        const value = Math.max(-1, Math.min((categories.data?.length || 0) + (categories.error ? 1 : 0), panelCursor.current + (action === 'NAV_UP' || action === 'CHANNEL_UP' ? -step : step)));
        panelCursor.current = value; setPanelIndex(value); focus.focus(value < 0 ? 'live:selector:close' : categories.error && value === 1 ? 'live:selector:retry' : `live:selector:${value}`);
      }
      return true;
    }
    if (action === 'BACK') return false;
    if (action === 'SELECT') { focus.select(); return true; }
    if (action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') { if (!catalog.loading) reveal(cursor.current + (action === 'CHANNEL_UP' ? -1 : 1) * Math.max(1, Math.floor(geometry.height / geometry.row))); return true; }
    if (!action.startsWith('NAV_')) return false;
    const key = focus.focused;
    if (key.startsWith('live:channel:')) {
      if (action === 'NAV_UP') { if (cursor.current === 0) focus.focus(CATEGORIES); else reveal(cursor.current - 1); }
      if (action === 'NAV_DOWN') reveal(cursor.current + 1);
      if (action === 'NAV_LEFT') showPanel();
      if (action === 'NAV_RIGHT') focus.focus(FAVORITE);
    } else if (key === FAVORITE) {
      if (action === 'NAV_LEFT') reveal(cursor.current);
      if (action === 'NAV_UP') focus.focus(GUIDE);
    } else {
      const controls = [CATEGORIES, SEARCH, GUIDE], at = Math.max(0, controls.indexOf(key));
      if (action === 'NAV_LEFT') focus.focus(controls[Math.max(0, at - 1)]!);
      if (action === 'NAV_RIGHT') focus.focus(controls[Math.min(2, at + 1)]!);
      if (action === 'NAV_DOWN') { if (catalog.error) focus.focus('live:retry'); else if (!catalog.loading) reveal(cursor.current); }
      if (action === 'NAV_UP' && key === 'live:retry') focus.focus(SEARCH);
    }
    return true;
  };
  const handler = useRef(handle); handler.current = handle;
  const enterResults = useRef(() => reveal(cursor.current)); enterResults.current = () => reveal(cursor.current);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const action = remoteAction(event); if (!action) return;
      if (event.target instanceof HTMLInputElement) {
        if (action === 'BACK' && (event.key === 'Backspace' || event.keyCode === 8)) { event.stopImmediatePropagation(); return; }
        if (action === 'SELECT' || action === 'BACK') { event.preventDefault(); event.stopImmediatePropagation(); event.target.blur(); if (action === 'SELECT') enterResults.current(); else focus.focus(SEARCH); }
        return;
      }
      if (handler.current(action)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [focus]);
  const categoryName = categories.data?.find(item => item.id === query.category)?.name || t('live.allChannels');
  const searchReturn = selected ? keyFor(selected.id) : SEARCH;
  const epgMessage = !epg || epg.loading ? t('live.epgLoading') : !epg.value || epg.value.status === 'error' ? t('live.epgError') : epg.value.status === 'empty' || next ? t('live.epgEmpty') : t('live.epgUnavailable');
  return <main className="screen catalog-screen live-browser">
    <header className="section-header"><div><span className="eyebrow">{t('live.eyebrow')}</span><h1>{t('live.title')}</h1></div>
      <Focusable focusKey={CATEGORIES} group="live-header" index={0} neighbors={{ right: SEARCH, down: searchReturn }} onSelect={showPanel} className="live-category-control" title={categoryName}><small>{t('common.categories')}</small><strong>{categoryName}</strong><span>⌄</span></Focusable>
      <SearchField focusKey={SEARCH} value={query.search} input={value => setQuery({ ...queryRef.current, search: value, offset: 0 })} placeholder={t('live.search')} neighbors={{ left: CATEGORIES, right: GUIDE, down: searchReturn }} />
      <Focusable focusKey={GUIDE} group="live-header" index={2} neighbors={{ left: SEARCH, down: searchReturn }} onSelect={() => { if (selected) focus.focus(keyFor(selected.id)); guide(); }} className="secondary-button">{t('guide.title')}</Focusable>
    </header>
    <div className="live-layout">
      <section className="channel-panel"><div className="list-heading"><h2>{t('live.channelCount', { count: rows.length })}</h2><span>{t('live.okToWatch')}</span></div>
        <div ref={viewport} className="channel-list" data-scroll-key="live:channels" aria-label={t('live.title')} onScroll={event => setTop(event.currentTarget.scrollTop)}>
          {catalog.loading ? <Spinner label={t('live.loading')} /> : catalog.error ? <div className="state-panel error"><p>{t('live.catalogError')}</p><Focusable focusKey="live:retry" group="live-status" index={0} onSelect={() => { pendingFocus.current = true; catalog.retry(); }} className="secondary-button">{t('common.retry')}</Focusable></div> : !rows.length ? <Empty>{t('live.empty')}</Empty> : <div className="live-channel-window" style={{ height: rows.length * geometry.row + 16 }}>
            {mounted.map(i => { const channel = rows[i]!; return <ChannelRow key={channel.id} channel={channel} index={i} number={channel.number || index.positions.get(channel.id)!} rowHeight={geometry.row} selected={selected?.id === channel.id} tuned={lastTuned === channel.id} favorite={favoriteIds.has(channel.id)} highlight={() => saveCursor(i)} play={() => play(channel, rows)} />; })}
          </div>}
        </div>
      </section>
      <aside className="epg-panel" aria-label={t('live.highlighted')}>{selected ? <>
        <div className="live-channel-identity"><Image src={selected.logo} alt={selected.name} className="epg-logo" /><div><span className="eyebrow">{t('live.highlighted')}</span><h2>{selected.name}</h2>{lastTuned === selected.id && <small className="live-last-tuned">{t('live.lastTuned')}</small>}</div></div>
        <div className="epg-program">{current ? <><span className="eyebrow">{t('live.nowOn')}</span><strong>{current.title}</strong><small>{formatTime(current.start)} – {formatTime(current.end)}</small></> : <span className="muted" role="status">{epgMessage}</span>}</div>
        {current && <Progress value={programProgress(current, now)} />}
        {next && <div className="up-next"><span>{t('live.upNext', { time: formatTime(next.start) })}</span><strong>{next.title}</strong></div>}
        {current?.description && <p>{current.description}</p>}
        {favoriteError && <small className="error" role="status">{favoriteError}</small>}
        <Focusable focusKey={FAVORITE} group="live-info" index={0} neighbors={{ left: keyFor(selected.id), up: GUIDE, down: FAVORITE, right: FAVORITE }} onSelect={toggleFavorite} className="epg-favorite">{saving ? t('library.saving') : favorite ? t('favorite.short') : t('favorite.add')}</Focusable>
      </> : <Empty>{t('live.selectChannel')}</Empty>}</aside>
    </div>
    {panel && <div className="live-category-overlay"><section className="live-category-dialog" role="dialog" aria-modal="true" aria-label={t('common.categories')}>
      <header><h2>{t('common.categories')}</h2><Focusable focusKey="live:selector:close" group="live-selector" index={-1} onFocus={() => { panelCursor.current = -1; setPanelIndex(-1); }} onSelect={closePanel}>{t('live.close')}</Focusable></header>
      <div className="live-category-options">
        <Focusable focusKey="live:selector:0" group="live-selector" index={0} onFocus={() => { panelCursor.current = 0; setPanelIndex(0); }} onSelect={() => changeCategory('')} className={!query.category ? 'selected-category' : ''}>{t('live.allChannels')}</Focusable>
        {categories.loading ? <Spinner /> : categories.error ? <div className="state-panel"><p>{t('live.categoriesError')}</p><Focusable focusKey="live:selector:retry" group="live-selector" index={1} onSelect={categories.retry}>{t('common.retry')}</Focusable></div> : categories.data?.map((item, i) => <Focusable key={item.id} focusKey={`live:selector:${i + 1}`} group="live-selector" index={i + 1} title={item.name} onFocus={() => { panelCursor.current = i + 1; setPanelIndex(i + 1); }} onSelect={() => changeCategory(item.id)} className={query.category === item.id ? 'selected-category' : ''}>{item.name}</Focusable>)}
      </div><small className="muted">{t('live.categoryHint')} · {Math.max(1, panelIndex + 1)} / {(categories.data?.length || 0) + 1}</small>
    </section></div>}
  </main>;
}
