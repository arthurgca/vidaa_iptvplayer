import { afterEach, expect, it, vi } from 'vitest';
import { clearXtreamCache, xtream } from '../server/xtream/client';

afterEach(() => { clearXtreamCache(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('shares concurrent complete catalogs and does not cache an obsolete account response after clearing', async () => {
  vi.stubEnv('XTREAM_BASE_URL', 'http://fixture.invalid'); vi.stubEnv('XTREAM_USERNAME', 'fixture'); vi.stubEnv('XTREAM_PASSWORD', 'fixture');
  let resolve!: (value: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockImplementation(async () => new Response('[{"stream_id":2}]'));
  const first = xtream('get_vod_streams'); const second = xtream('get_vod_streams');
  expect(fetch).toHaveBeenCalledTimes(1); clearXtreamCache();
  expect(await xtream('get_vod_streams')).toEqual([{ stream_id: 2 }]);
  resolve(new Response('[{"stream_id":1}]'));
  expect(await first).toEqual([{ stream_id: 1 }]); expect(await second).toEqual([{ stream_id: 1 }]);
  expect(await xtream('get_vod_streams')).toEqual([{ stream_id: 2 }]); expect(fetch).toHaveBeenCalledTimes(2);
});
it('rejects HTTP-200 authentication/error objects instead of caching them as an empty movie catalog', async () => {
  vi.stubEnv('XTREAM_BASE_URL', 'http://fixture.invalid'); vi.stubEnv('XTREAM_USERNAME', 'fixture'); vi.stubEnv('XTREAM_PASSWORD', 'fixture');
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"user_info":{"auth":0}}')).mockResolvedValueOnce(new Response('[]'));
  await expect(xtream('get_vod_streams')).rejects.toThrow('invalid movie catalog');
  expect(await xtream('get_vod_streams')).toEqual([]); expect(fetch).toHaveBeenCalledTimes(2);
});
