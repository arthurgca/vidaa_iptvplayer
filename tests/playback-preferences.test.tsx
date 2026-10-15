// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { api, type LiveSelection } from '../src/api/client';
import { Player, type Playable } from '../src/player/Player';
import type { Channel } from '../src/types';

vi.mock('../src/player/Player', () => ({
  Player: vi.fn(({ media, close, liveChannelChanged }: { media: Playable; close: () => void; liveChannelChanged?: (channel: Channel) => void }) => {
    liveChannelChanged?.(media.item as Channel);
    return <main className="test-player"><span>{media.id}</span><button onClick={close}>Close playback</button></main>;
  })
}));

let container: HTMLDivElement;
const channels = Array.from({ length: 205 }, (_, index) => ({ id: String(index), name: `Channel ${index}`, categoryId: 'news' }));
const selection = { channel: channels[204]!, offset: 200, channels: channels.slice(200) };
const status = { version: '1.2.2', configured: true, demoMode: true, language: 'en' as const, languageConfigured: true, autoplayLive: false };
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const focusSettled = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 70)));
const back = async () => { act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await settle(); };
async function mount() { act(() => render(<App />, container)); await settle(); }

beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  vi.mocked(Player).mockClear();
  vi.spyOn(api, 'status').mockResolvedValue(status);
  vi.spyOn(api, 'liveSelection').mockResolvedValue(selection);
  vi.spyOn(api, 'liveCategories').mockResolvedValue([]);
  vi.spyOn(api, 'channels').mockImplementation(async (_category, offset = 0) => ({ items: channels.slice(offset, offset + 100), total: channels.length, offset, limit: 100 }));
  vi.spyOn(api, 'epg').mockResolvedValue({ progress: 0 });
  vi.spyOn(api, 'favorites').mockResolvedValue([]);
});

afterEach(() => {
  act(() => render(null, container)); container.remove(); vi.restoreAllMocks();
});

describe('playback preference navigation', () => {
  it('stays on Home when autoplay is disabled', async () => {
    await mount();
    expect(container.querySelector('.home-screen')).not.toBeNull();
    expect(Player).not.toHaveBeenCalled();
    expect(api.liveSelection).not.toHaveBeenCalled();
  });

  it('autoplays the selected channel and returns to its catalog page, then Home', async () => {
    vi.mocked(api.status).mockResolvedValue({ ...status, autoplayLive: true });
    await mount();
    const calls = vi.mocked(Player).mock.calls;
    expect(calls[calls.length - 1]?.[0].media).toMatchObject({ type: 'live', id: '204', channels: selection.channels });
    act(() => container.querySelector<HTMLButtonElement>('.test-player button')!.click()); await settle(); await focusSettled();
    expect(api.channels).toHaveBeenLastCalledWith(undefined, 200, '');
    expect(document.activeElement?.textContent).toContain('Channel 204');
    await back();
    expect(container.querySelector('.home-screen')).not.toBeNull();
    expect(api.liveSelection).toHaveBeenCalledTimes(1);
  });

  it('restores the remembered channel for manual Live TV entry without starting playback', async () => {
    await mount();
    act(() => container.querySelector<HTMLButtonElement>('.home-card')!.click()); await settle(); await settle(); await focusSettled();
    expect(api.channels).toHaveBeenLastCalledWith(undefined, 200, '');
    expect(document.activeElement?.textContent).toContain('Channel 204');
    expect(Player).not.toHaveBeenCalled();
  });

  it.each(['empty', 'failure'])('stays usable when the autoplay catalog is %s', async (kind) => {
    vi.mocked(api.status).mockResolvedValue({ ...status, autoplayLive: true });
    if (kind === 'empty') vi.mocked(api.liveSelection).mockResolvedValue({ offset: 0, channels: [] });
    else vi.mocked(api.liveSelection).mockRejectedValue(new Error('Provider offline'));
    await mount();
    expect(container.querySelector('.home-screen')).not.toBeNull();
    expect(Player).not.toHaveBeenCalled();
  });

  it('ignores a slow Live TV selection after the user navigates elsewhere', async () => {
    let resolve!: (value: LiveSelection) => void;
    vi.mocked(api.liveSelection).mockImplementation(() => new Promise((done) => { resolve = done; }));
    vi.spyOn(api, 'history').mockResolvedValue([]);
    await mount();
    act(() => container.querySelector<HTMLButtonElement>('.home-card')!.click());
    act(() => (container.querySelectorAll('.home-card')[4] as HTMLButtonElement).click()); await settle();
    await act(async () => { resolve(selection); await Promise.resolve(); });
    expect(container.querySelector('.channel-list')).toBeNull();
    expect(api.channels).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Recently Watched');
  });
});
