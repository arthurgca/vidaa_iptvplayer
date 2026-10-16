// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { useAsync } from '../src/hooks/useAsync';

const container = document.createElement('div');
afterEach(() => act(() => render(null, container)));
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

it('ignores older dependency and retry responses, including stale loading/error updates', async () => {
  const old = deferred(), latest = deferred(), retry = deferred();
  let state!: ReturnType<typeof useAsync<string>>;
  function Harness({ id, load }: { id: string; load: () => Promise<string> }) {
    state = useAsync(load, [id]); return <span>{state.data}</span>;
  }
  act(() => render(<Harness id="old" load={() => old.promise} />, container)); await settle();
  let calls = 0;
  act(() => render(<Harness id="latest" load={() => ++calls === 1 ? latest.promise : retry.promise} />, container)); await settle();
  act(() => latest.resolve('latest')); await settle();
  expect(state.data).toBe('latest');
  act(() => state.retry()); await settle();
  act(() => old.reject(new Error('obsolete'))); await settle();
  expect(state.loading).toBe(true);
  expect(state.error).toBe('');
  act(() => retry.resolve('retry')); await settle();
  expect(state.data).toBe('retry');
  expect(state.loading).toBe(false);
});
