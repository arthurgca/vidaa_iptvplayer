import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/api/client';

afterEach(() => vi.restoreAllMocks());

it('requests 20 live channels per page while preserving filters and offset', async () => {
  const result = { offset: 40, limit: 20, total: 205, items: [] };
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(result)));
  expect(await api.channels('news', 40, 'match')).toEqual(result);
  const params = new URL(fetch.mock.calls[0]![0] as string, 'http://localhost').searchParams;
  expect(params.get('limit')).toBe('20');
  expect(params.get('offset')).toBe('40');
  expect(params.get('category_id')).toBe('news');
  expect(params.get('search')).toBe('match');
});
