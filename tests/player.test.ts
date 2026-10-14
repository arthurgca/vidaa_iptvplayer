import { describe, expect, it } from 'vitest';
import { clampSeekTime, formatPlaybackTime, isAspectMode, nextAspectMode, parseMediaDuration } from '../src/player/Player';

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

  it('uses provider duration metadata when the video element has no duration', () => {
    expect(parseMediaDuration('01:48:30')).toBe(6510);
    expect(parseMediaDuration('1h 48m')).toBe(6480);
    expect(parseMediaDuration('52m')).toBe(3120);
    expect(parseMediaDuration('6480')).toBe(6480);
    expect(parseMediaDuration(undefined)).toBe(0);
  });
});

describe('player aspect ratio helpers', () => {
  it('cycles through every display mode in both directions', () => {
    expect(nextAspectMode('auto')).toBe('16:9');
    expect(nextAspectMode('stretch')).toBe('auto');
    expect(nextAspectMode('auto', -1)).toBe('stretch');
  });

  it('rejects stale or invalid saved display modes', () => {
    expect(isAspectMode('4:3')).toBe(true);
    expect(isAspectMode('fullscreen')).toBe(false);
    expect(isAspectMode(null)).toBe(false);
  });
});
