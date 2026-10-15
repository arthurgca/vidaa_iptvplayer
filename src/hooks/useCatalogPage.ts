import { useEffect, useRef, useState } from 'preact/hooks';
import type { MovieSort, Page } from '../types';

export interface CatalogQuery { category: string; search: string; offset: number; sort?: MovieSort }
export const emptyCatalogQuery = (): CatalogQuery => ({ category: '', search: '', offset: 0 });
export const filterCatalog = (query: CatalogQuery, filter: Partial<Pick<CatalogQuery, 'category' | 'search'>>): CatalogQuery =>
  ({ ...query, ...filter, offset: 0 });

/** A response belongs to one query/page only; slow requests must never replace newer results. */
export function useCatalogPage<T>(loader: () => Promise<Page<T>>, kind: string, query: CatalogQuery) {
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([kind, query.category, query.search, query.offset, revision]);
  const load = useRef(loader); load.current = loader;
  const [state, setState] = useState<{ key: string; data?: Page<T>; error: string; loading: boolean }>();
  useEffect(() => {
    let active = true;
    setState({ key: requestKey, error: '', loading: true });
    load.current().then((data) => {
      if (active) setState({ key: requestKey, data, error: '', loading: false });
    }).catch((reason) => {
      if (active) setState({ key: requestKey, error: reason instanceof Error ? reason.message : 'Unable to load.', loading: false });
    });
    return () => { active = false; };
  }, [requestKey]);
  const current = state?.key === requestKey ? state : undefined;
  return { data: current?.data, error: current?.error || '', loading: current?.loading ?? true, retry: () => setRevision((value) => value + 1) };
}
