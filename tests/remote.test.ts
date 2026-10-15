// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { listenToRemote, remoteAction } from '../src/platform/remote';

describe('remote page/channel buttons', () => {
  it.each([
    ['PageUp', 0, 'CHANNEL_UP'], ['PageDown', 0, 'CHANNEL_DOWN'],
    ['ChannelUp', 0, 'CHANNEL_UP'], ['ChannelDown', 0, 'CHANNEL_DOWN'],
    ['Unidentified', 427, 'CHANNEL_UP'], ['Unidentified', 428, 'CHANNEL_DOWN'],
    ['Unidentified', 33, 'CHANNEL_UP'], ['Unidentified', 34, 'CHANNEL_DOWN']
  ])('maps %s / %s to %s', (key, keyCode, action) => {
    expect(remoteAction(new KeyboardEvent('keydown', { key, keyCode }))).toBe(action);
  });

  it('handles page buttons centrally while leaving text editing alone', () => {
    const handler = vi.fn(); const stop = listenToRemote(handler);
    const input = document.createElement('input'); document.body.append(input);
    try {
      const editing = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
      input.dispatchEvent(editing);
      expect(handler).not.toHaveBeenCalled(); expect(editing.defaultPrevented).toBe(false);
      const navigation = new KeyboardEvent('keydown', { key: 'PageDown', cancelable: true });
      document.dispatchEvent(navigation);
      expect(handler).toHaveBeenCalledWith('CHANNEL_DOWN', navigation);
      expect(navigation.defaultPrevented).toBe(true);
    } finally { stop(); input.remove(); }
  });
});
