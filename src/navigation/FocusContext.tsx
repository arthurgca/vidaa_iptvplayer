import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { FocusManager, type Direction, type FocusNode, type NeighborTarget } from './FocusManager';

import type { RemoteAction } from '../platform/remote';

const manager = new FocusManager();
const FocusContext = createContext(manager);

export function FocusProvider({ children }: { children: preact.ComponentChildren }) {
  return <FocusContext.Provider value={manager}>{children}</FocusContext.Provider>;
}

export function useFocusManager() { return useContext(FocusContext); }
export function useFocusedKey() {
  const focus = useFocusManager(); const [key, setKey] = useState(focus.focused);
  useEffect(() => focus.subscribe(setKey), [focus]); return key;
}

interface FocusProxyOptions {
  focusKey: string; group: string; index: number; columns?: number; orientation?: FocusNode['orientation'];
  neighbors?: Partial<Record<Direction, NeighborTarget>>; autoFocus?: boolean; activate: () => void;
}

/**
 * Registers a plain element (an input wrapper, not a button) as a focus target so the D-pad can reach it.
 * OK on the wrapper hands focus to the real control, which is when the TV raises its on-screen keyboard.
 */
export function useFocusProxy({ focusKey, group, index, columns, orientation = 'vertical', neighbors, autoFocus, activate }: FocusProxyOptions) {
  const focus = useFocusManager();
  const proxy = useRef<HTMLDivElement>(null);
  const activateRef = useRef(activate);
  activateRef.current = activate;
  useLayoutEffect(() => {
    if (!proxy.current) return;
    const element = proxy.current;
    focus.register({ key: focusKey, group, index, columns, orientation, neighbors, autoFocus, onSelect: () => activateRef.current(), element });
  }, [focus, focusKey, group, index, columns, orientation, autoFocus, JSON.stringify(neighbors)]);
  useLayoutEffect(() => {
    const element = proxy.current!;
    return () => focus.unregister(focusKey, element);
  }, [focus, focusKey]);
  return {
    ref: proxy,
    tabIndex: -1,
    onFocus: () => { if (focus.focused !== focusKey) focus.focus(focusKey); },
    onMouseEnter: () => focus.focus(focusKey)
  };
}

interface FocusableProps {
  focusKey: string; group: string; index: number; columns?: number; orientation?: FocusNode['orientation'];
  neighbors?: Partial<Record<Direction, NeighborTarget>>; onSelect: () => void; className?: string; children: preact.ComponentChildren;
  disabled?: boolean; title?: string; onFocus?: () => void;
  hoverFocus?: boolean;
  pressed?: boolean;
}

export function Focusable({ focusKey, group, index, columns, orientation, neighbors, onSelect, className = '', children, disabled, title, onFocus, hoverFocus = true, pressed }: FocusableProps) {
  const focus = useFocusManager(); const ref = useRef<HTMLButtonElement>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  // Season switches replace neighbors and episode buttons in the same commit.
  // Register before paint so the next remote event cannot follow obsolete targets.
  useLayoutEffect(() => {
    if (!ref.current || disabled) return;
    const element = ref.current;
    focus.register({ key: focusKey, group, index, columns, orientation, neighbors, onSelect: () => selectRef.current(), element });
  }, [focus, focusKey, group, index, columns, orientation, disabled, JSON.stringify(neighbors)]);
  useLayoutEffect(() => {
    const element = ref.current!;
    if (disabled) { focus.unregister(focusKey, element); return; }
    return () => focus.unregister(focusKey, element);
  }, [focus, focusKey, disabled]);
  return <button ref={ref} type="button" tabIndex={-1} data-focus-key={focusKey} aria-pressed={pressed} className={`focusable ${className}`} onClick={onSelect} onFocus={onFocus} onMouseEnter={hoverFocus ? () => focus.focus(focusKey) : undefined} disabled={disabled} title={title}>{children}</button>;
}

/** Call after temporary interactions handle their keys, before ordinary route Back.
 * Only moves focus: the screen, its data and its scroll containers stay mounted.
 */
export function useSectionNavigation(controls: string[], context: string) {
  const focus = useFocusManager();
  const origins = useRef(new Map<string, { key: string; group?: string }>());
  return (action: RemoteAction) => {
    if (!focus.rootScope || !controls.length) return false;
    const onControls = controls.includes(focus.focused);
    if (action === 'BACK' && !onControls) {
      const origin = { key: focus.focused, group: focus.focusedGroup };
      if (!origin.group) return false;
      // Do not scroll the shared screen container just to focus its header.
      if (!controls.some(key => focus.focus(key, false))) return false;
      origins.current.set(context, origin);
      return true;
    }
    if (action === 'NAV_DOWN' && onControls) {
      const origin = origins.current.get(context);
      if (!origin) return false;
      origins.current.delete(context);
      // Stable IDs survive updates. A removed item falls back to the first valid
      // item in its original group, then the screen's normal Down handling.
      return focus.focus(origin.key) || Boolean(origin.group && focus.focusGroupFirst(origin.group));
    }
    return false;
  };
}
