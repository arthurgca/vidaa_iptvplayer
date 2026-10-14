import { describe, expect, it } from 'vitest';
import { guideStart, scheduleWindow } from '../server/epg/schedule';

describe('guide schedule window', () => {
  it('includes overlapping programmes, excludes exact end boundaries and rejects invalid times', () => {
    const program = (start: number, end: number) => ({ channelId: 'one', title: `${start}`, start, end });
    const programs = [program(200, 300), program(50, 150), program(300, 400), program(0, 100), program(180, 180), program(190, Infinity)];
    expect(scheduleWindow(programs, 100, 300).map((row) => row.start)).toEqual([50, 200]);
    expect(programs[0]?.start).toBe(200);
  });

  it('bounds requested windows to the retained guide data and defaults invalid input to this hour', () => {
    const now = 100 * 3600_000 + 123;
    expect(guideStart('bad', now)).toBe(100 * 3600_000);
    expect(guideStart('Infinity', now)).toBe(100 * 3600_000);
    expect(guideStart('0', now)).toBe(now - 6 * 3600_000);
    expect(guideStart(String(now + 100 * 3600_000), now)).toBe(now + 45 * 3600_000);
  });
});
