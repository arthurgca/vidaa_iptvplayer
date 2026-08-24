import { describe, expect, it } from 'vitest';
import { clampSeekTime, formatPlaybackTime } from '../src/player/Player';

describe('player timeline helpers', () => {
  it('formats short and long playback positions', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(65.9)).toBe('1:05');
    expect(formatPlaybackTime(3661)).toBe('1:01:01');
  });

  it('keeps seek targets inside the playable duration', () => {
    expect(clampSeekTime(-10, 120)).toBe(0);
    expect(clampSeekTime(45, 120)).toBe(45);
    expect(clampSeekTime(150, 120)).toBe(120);
    expect(clampSeekTime(30, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
