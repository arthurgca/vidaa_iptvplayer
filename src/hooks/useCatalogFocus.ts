import { useEffect, useRef } from 'preact/hooks';
import { useFocusManager } from '../navigation/FocusContext';
import { restoreBrowseScroll, type ScrollPosition } from '../navigation/scroll';

/** Restore route focus after the asynchronous page has registered its buttons. */
export function useCatalogFocus(kind: string, loading: boolean, firstItem: string | undefined, fallback: string, restoreFocus?: string, scroll?: ScrollPosition[]) {
  const focus = useFocusManager();
  const pendingRestore = useRef(restoreFocus);
  const pendingPage = useRef(false);
  useEffect(() => {
    if (focus.focused.startsWith(`${kind}:page:`)) pendingPage.current = true;
    if (loading) {
      // Unmounted page cards/pagers cannot retain an invisible focus during a slow request.
      if (!focus.focus(focus.focused)) focus.focus(fallback);
      return;
    }
    const timer = window.setTimeout(() => {
      const restoring = pendingRestore.current;
      const target = pendingRestore.current || focus.focused;
      if (pendingRestore.current && firstItem) pendingRestore.current = undefined;
      if (!restoring && pendingPage.current && firstItem) focus.focus(firstItem);
      else if (!focus.focus(target)) {
        if (!firstItem || !focus.focus(firstItem)) focus.focus(fallback);
      }
      if (firstItem) pendingPage.current = false;
      if (restoring && focus.focused === restoring) restoreBrowseScroll(scroll);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [kind, loading, firstItem, fallback, restoreFocus, focus]);
}
