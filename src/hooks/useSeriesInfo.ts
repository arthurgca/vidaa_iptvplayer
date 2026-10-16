import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import type { SeriesInfo } from '../types';

/** Each result belongs to one show and retry; late results cannot replace a new show. */
export function useSeriesInfo(id: string) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([id, revision]);
  const [state, setState] = useState<{ key: string; data?: SeriesInfo; error?: string }>();
  useEffect(() => {
    let active = true;
    api.seriesInfo(id).then(data => { if (active) setState({ key, data }); })
      .catch(() => { if (active) setState({ key, error: 'unavailable' }); });
    return () => { active = false; };
  }, [key]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: !current, retry: () => setRevision(value => value + 1) };
}
