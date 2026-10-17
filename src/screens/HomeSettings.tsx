import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { defaultHomePreferences, type HomePreferences } from '../homePreferences';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import { useTranslate } from '../i18n/I18nContext';
import type { Category } from '../types';

const PAGE_SIZE = 20;
type Kind = 'movies' | 'series';
type Control = { id: string; label: string; choose: () => void; checked?: boolean; active?: boolean; help?: string; title?: string; neighbors?: { up?: string; down?: string; left?: string; right?: string } };
const key = (id: string) => `settings:home:${id}`;

/** Module-level component, ID-keyed controls, and bounded pages preserve focus on large category lists. */
export function HomeSettings({ value, change, locked, busy }: {
  value: HomePreferences | null; change: (value: HomePreferences | null) => void; locked: boolean; busy: boolean;
}) {
  const t = useTranslate(); const focus = useFocusManager();
  const preferences = value ?? defaultHomePreferences();
  const [kind, setKind] = useState<Kind>('movies'); const [order, setOrder] = useState(false); const [page, setPage] = useState(0);
  const pendingFocus = useRef<string>();
  const movies = useAsync(() => locked ? Promise.resolve([]) : api.vodCategories(), [locked]);
  const series = useAsync(() => locked ? Promise.resolve([]) : api.seriesCategories(), [locked]);
  const source = kind === 'movies' ? movies : series;
  const field = kind === 'movies' ? 'movieCategoryIds' : 'seriesCategoryIds';
  const selected = preferences[field];
  const available = useMemo(() => new Map((source.data || []).map(category => [category.id, category])), [source.data]);
  const categories = useMemo(() => {
    const result = [...available.values()];
    for (const id of selected || []) if (!available.has(id)) result.push({ id, name: t('settings.home.unavailable', { id }) });
    return result;
  }, [available, JSON.stringify(selected), t]);
  const list: Category[] = order ? (selected || []).map(id => available.get(id) || { id, name: t('settings.home.unavailable', { id }) }) : categories;
  const maxPage = Math.max(0, Math.ceil(list.length / PAGE_SIZE) - 1); const currentPage = Math.min(page, maxPage);
  const visible = list.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const edit = (next: HomePreferences | null) => { if (!locked && !busy) change(next); };
  const update = (ids: string[] | null) => edit({ ...preferences, [field]: ids });
  const switchKind = (next: Kind) => { setKind(next); setPage(0); };
  const toggle = (id: string) => {
    if (locked || busy) return;
    if (order && selected?.includes(id)) {
      const index = selected.indexOf(id);
      pendingFocus.current = key(selected[index + 1] ? `${kind}:${selected[index + 1]}` : selected[index - 1] ? `${kind}:${selected[index - 1]}` : 'order');
      setPage(Math.floor(Math.max(0, Math.min(index, selected.length - 2)) / PAGE_SIZE));
    }
    update(selected?.includes(id) ? selected.filter(value => value !== id) : [...selected || [], id]);
  };
  const move = (id: string, direction: -1 | 1) => {
    if (!selected || locked || busy) return;
    const from = selected.indexOf(id), to = from + direction;
    if (from < 0 || to < 0 || to >= selected.length) return;
    const next = [...selected]; [next[from], next[to]] = [next[to]!, next[from]!];
    pendingFocus.current = key(`${kind}:${id}:${direction === -1 ? 'up' : 'down'}`);
    setPage(Math.floor(to / PAGE_SIZE)); update(next);
  };
  const categoryKey = (id: string) => key(`${kind}:${id}`);
  const controls: Control[] = [
    ...(['continueWatching', 'favorites'] as const).map(id => ({ id, label: t(id === 'continueWatching' ? 'browse.continue' : 'library.favorites.title'), checked: preferences.sectionVisibility[id], choose: () => edit({ ...preferences, sectionVisibility: { ...preferences.sectionVisibility, [id]: !preferences.sectionVisibility[id] } }) })),
    { id: 'movies', label: t('settings.home.movies'), active: kind === 'movies', choose: () => switchKind('movies') },
    { id: 'series', label: t('settings.home.series'), active: kind === 'series', choose: () => switchKind('series') },
    { id: 'choose', label: t('settings.home.choose'), active: !order, choose: () => { setOrder(false); setPage(0); } },
    { id: 'order', label: t('settings.home.order'), active: order, choose: () => { setOrder(true); setPage(0); } },
    { id: 'original', label: t('settings.home.original'), checked: selected === null, help: t(selected === null ? 'settings.home.defaultHelp' : 'settings.home.selectedHelp', { count: selected?.length || 0 }), choose: () => update(selected === null ? [] : null) }
  ];
  if (source.error) controls.push({ id: 'retry', label: t('common.retry'), help: t('settings.home.loadError'), choose: source.retry });
  for (const category of visible) {
    const id = `${kind}:${category.id}`;
    const selectedIndex = selected?.indexOf(category.id) ?? -1;
    const previous = visible[visible.indexOf(category) - 1]; const next = visible[visible.indexOf(category) + 1];
    controls.push({ id, label: category.name, title: `${category.name} · ID ${category.id}`, checked: selectedIndex >= 0,
      help: order ? `${selectedIndex + 1} / ${selected?.length}` : `ID ${category.id}`, choose: () => toggle(category.id),
      neighbors: order ? { left: categoryKey(category.id), right: key(`${id}:up`), up: previous ? categoryKey(previous.id) : key('original'), down: next ? categoryKey(next.id) : key(maxPage ? 'previous' : 'restore') } : undefined });
    if (order) for (const direction of [-1, 1] as const) {
      const action = direction === -1 ? 'up' : 'down';
      controls.push({ id: `${id}:${action}`, label: t(direction === -1 ? 'settings.home.up' : 'settings.home.down'), choose: () => move(category.id, direction),
        neighbors: { left: direction === -1 ? categoryKey(category.id) : key(`${id}:up`), right: key(`${id}:down`),
          up: previous ? key(`${kind}:${previous.id}:${action}`) : key('original'), down: next ? key(`${kind}:${next.id}:${action}`) : key(maxPage ? 'previous' : 'restore') } });
    }
  }
  if (maxPage) for (const direction of [-1, 1] as const) controls.push({ id: direction === -1 ? 'previous' : 'next', label: t(direction === -1 ? 'settings.home.previous' : 'settings.home.next', { page: currentPage + 1, pages: maxPage + 1 }), choose: () => {
    const next = Math.max(0, Math.min(maxPage, currentPage + direction));
    if (next === currentPage) return;
    pendingFocus.current = categoryKey(list[next * PAGE_SIZE]!.id); setPage(next);
  } });
  controls.push({ id: 'restore', label: t('settings.home.restore'), help: t('settings.home.restoreHelp'), choose: () => edit(null) });
  useLayoutEffect(() => { if (pendingFocus.current) { focus.focus(pendingFocus.current); pendingFocus.current = undefined; } });
  return <div className="home-settings">
    {locked && <p className="browse-warning">{t('settings.home.providerFirst')}</p>}
    <p className="settings-section-help">{t('settings.home.help')}</p>
    <div className={order ? 'home-settings-controls ordering' : 'home-settings-controls'}>
      {controls.map((control, index) => <div key={control.id} className={`home-setting-item${control.id.startsWith(`${kind}:`) ? ' category' : ''}${control.id.endsWith(':up') || control.id.endsWith(':down') ? ' move' : ''}`}>
        <Focusable focusKey={key(control.id)} group="settings-controls" index={index} className={`settings-value${control.checked || control.active ? ' enabled' : ''}`} title={control.title} pressed={control.checked ?? control.active}
          neighbors={{ up: index ? key(controls[index - 1]!.id) : 'settings:tab:home', down: controls[index + 1] ? key(controls[index + 1]!.id) : 'settings:save', left: key(control.id), right: key(control.id), ...control.neighbors }} onSelect={control.choose}>
          <span><strong>{control.label}</strong>{control.help && <small>{control.help}</small>}</span>
          {control.checked !== undefined && <span className={`settings-switch${control.checked ? ' checked' : ''}`} aria-label={t(control.checked ? 'settings.ui.on' : 'settings.ui.off')}>{control.checked ? '✓' : '−'}</span>}
          {control.active !== undefined && <span aria-hidden="true">{control.active ? '●' : '›'}</span>}
        </Focusable>
      </div>)}
    </div>
    {source.loading && <p role="status">{t('settings.loading')}</p>}
    {!source.loading && !source.error && !list.length && <p>{t(order ? 'settings.home.noSelected' : 'settings.home.noCategories')}</p>}
  </div>;
}
