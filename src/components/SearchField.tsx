import { useRef } from 'preact/hooks';
import { useTranslate } from '../i18n/I18nContext';
import { useFocusProxy } from '../navigation/FocusContext';
import type { Direction, NeighborTarget } from '../navigation/FocusManager';

interface SearchFieldProps {
  focusKey: string; value: string; placeholder: string; input: (value: string) => void;
  neighbors?: Partial<Record<Direction, NeighborTarget>>;
}

export function SearchField({ focusKey, value, placeholder, input, neighbors }: SearchFieldProps) {
  const t = useTranslate();
  const target = useRef<HTMLInputElement>(null);
  const proxy = useFocusProxy({
    focusKey, group: `${focusKey}-field`, index: 0, orientation: 'horizontal', neighbors,
    // Never the landing spot when a screen opens — the catalog below it is what the viewer came for.
    autoFocus: false,
    activate: () => { target.current?.focus(); target.current?.click(); }
  });
  return <div {...proxy} className="search-control" data-focus-proxy>
    <input ref={target} tabIndex={-1} className="search" value={value} placeholder={placeholder} aria-label={placeholder} onInput={(event) => input(event.currentTarget.value)} />
    <small className="search-hint">{t('search.hint')}</small>
  </div>;
}
