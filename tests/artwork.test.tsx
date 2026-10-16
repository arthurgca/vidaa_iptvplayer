// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { Image } from '../src/components/common';

it('does not retry broken artwork on remount, allows another source and retries after one minute', () => {
  const container = document.createElement('div'); document.body.append(container);
  let now = Date.now(); const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    act(() => render(<Image src="/fixture-broken.jpg" alt="Series" />, container));
    act(() => { container.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    act(() => render(null, container)); act(() => render(<Image src="/fixture-broken.jpg" alt="Series" />, container));
    expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toBe('S');
    act(() => render(<Image src="/fixture-other.jpg" alt="Series" />, container)); expect(container.querySelector('img')?.getAttribute('src')).toBe('/fixture-other.jpg');
    now += 60001;
    act(() => render(<Image src="/fixture-broken.jpg" alt="Series" />, container)); expect(container.querySelector('img')?.getAttribute('src')).toBe('/fixture-broken.jpg');
  } finally { act(() => render(null, container)); container.remove(); clock.mockRestore(); }
});
