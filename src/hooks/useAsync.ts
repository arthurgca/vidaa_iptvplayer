import { useCallback, useEffect, useState } from 'preact/hooks';

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const run = useCallback(() => { setLoading(true); setError(''); loader().then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load.')).finally(() => setLoading(false)); }, deps);
  useEffect(run, [run]);
  return { data, error, loading, retry: run };
}
