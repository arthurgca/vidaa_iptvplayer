import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const run = useCallback(() => {
    const request = ++generation.current;
    setLoading(true); setError('');
    loader().then(value => { if (request === generation.current) setData(value); })
      .catch(reason => { if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load.'); })
      .finally(() => { if (request === generation.current) setLoading(false); });
  }, deps);
  // Invalidate at commit, including unmount, before a late promise can publish.
  useLayoutEffect(() => () => { generation.current++; }, [run]);
  useEffect(run, [run]);
  return { data, error, loading, retry: run };
}
