import type { Program } from '../types.js';

export function scheduleWindow(programs: Program[], start: number, end: number) {
  const seen = new Set<string>();
  return programs.filter((program) => {
    const key = JSON.stringify([program.channelId, program.start, program.end, program.title]);
    if (!program.title.trim() || /^(no programmes?|no programs?|no programme information|sem programa[cç][aã]o)[.!]?$/i.test(program.title.trim()) || !Number.isFinite(program.start) || !Number.isFinite(program.end) || program.end <= program.start || program.end <= start || program.start >= end || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}

export function guideStart(value: unknown, now = Date.now()) {
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.max(now - 6 * 3600_000, Math.min(now + 45 * 3600_000, parsed)) : Math.floor(now / 3600_000) * 3600_000;
}
