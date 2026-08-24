import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { FocusManager, type Direction, type FocusNode } from './FocusManager';

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

interface FocusableProps {
  focusKey: string; group: string; index: number; columns?: number; orientation?: FocusNode['orientation'];
  neighbors?: Partial<Record<Direction, string>>; onSelect: () => void; className?: string; children: preact.ComponentChildren;
  disabled?: boolean; title?: string; onFocus?: () => void;
}

export function Focusable({ focusKey, group, index, columns, orientation, neighbors, onSelect, className = '', children, disabled, title, onFocus }: FocusableProps) {
  const focus = useFocusManager(); const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ref.current || disabled) return;
    focus.register({ key: focusKey, group, index, columns, orientation, neighbors, onSelect, element: ref.current });
    return () => focus.unregister(focusKey);
  }, [focus, focusKey, group, index, columns, orientation, disabled, onSelect, JSON.stringify(neighbors)]);
  return <button ref={ref} type="button" tabIndex={-1} className={`focusable ${className}`} onClick={onSelect} onFocus={onFocus} onMouseEnter={() => focus.focus(focusKey)} disabled={disabled} title={title}>{children}</button>;
}
