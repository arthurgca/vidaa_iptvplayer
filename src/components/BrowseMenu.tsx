import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import type { RemoteAction } from '../platform/remote';

interface MenuEntry { id: string; label: string; select: () => void }

/** Screen handlers delegate here to keep virtual lists still while the menu is open. */
export function useBrowseMenu(scope: string, entries: MenuEntry[]) {
  const focus = useFocusManager(); const t = useTranslate();
  const [active, setActive] = useState(false);
  const origin = useRef('');
  const prefix = `${scope}:menu`;
  const close = () => { setActive(false); focus.setScope('root'); focus.focus(origin.current); };
  const show = () => { origin.current = focus.focused; focus.setScope(prefix); setActive(true); };
  useLayoutEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Child focus targets register after the parent's layout effect.
    void Promise.resolve().then(() => { if (!cancelled) focus.focus(`${prefix}:${entries[0]!.id}`); });
    return () => { cancelled = true; };
  }, [active]);
  const handle = (action: RemoteAction) => {
    if (!active) {
      if (action !== 'OPTIONS') return false;
      show(); return true;
    }
    if (action === 'BACK' || action === 'OPTIONS') close();
    else if (action === 'SELECT') focus.select();
    else if (action === 'NAV_UP') focus.move('up');
    else if (action === 'NAV_DOWN') focus.move('down');
    return true;
  };
  const menu = active && <div className="movies-modal browse-menu"><section className="movies-category-dialog browse-menu-dialog" role="dialog" aria-modal="true" aria-label={t('browse.options')}>
    <header><h2>{t('browse.options')}</h2><Focusable focusKey={`${prefix}:close`} group={prefix} index={-1} neighbors={{ down: `${prefix}:${entries[0]!.id}` }} onSelect={close}>{t('common.back')}</Focusable></header>
    <div className="movies-category-options">{entries.map((entry, index) => <Focusable key={entry.id} focusKey={`${prefix}:${entry.id}`} group={prefix} index={index}
      neighbors={{ up: index === 0 ? `${prefix}:close` : `${prefix}:${entries[index - 1]!.id}`, down: `${prefix}:${entries[Math.min(entries.length - 1, index + 1)]!.id}` }}
      onSelect={() => { close(); entry.select(); }}>{entry.label}</Focusable>)}</div>
  </section></div>;
  return { active, show, handle, menu };
}
