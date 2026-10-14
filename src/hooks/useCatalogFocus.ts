import { useEffect, useRef } from 'preact/hooks';
import { useFocusManager } from '../navigation/FocusContext';

/** Restore route focus after the asynchronous page has registered its buttons. */
export function useCatalogFocus(kind: string, loading: boolean, firstItem: string | undefined, fallback: string, restoreFocus?: string) {
  const focus = useFocusManager();
  const pendingRestore = useRef(restoreFocus);
  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      const target = pendingRestore.current || focus.focused;
      if (pendingRestore.current && firstItem) pendingRestore.current = undefined;
      if (focus.focused.startsWith(`${kind}:page:`) && firstItem) focus.focus(firstItem);
      else if (!focus.focus(target)) {
        if (!firstItem || !focus.focus(firstItem)) focus.focus(fallback);
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [kind, loading, firstItem, fallback, restoreFocus, focus]);
}
