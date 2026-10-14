import { describe, expect, it } from 'vitest';
import type Hls from 'hls.js';
import { isWatched, nextEpisode, resumePosition } from '../src/player/history';
import { RecoveryBudget } from '../src/player/recovery';
import { audioChoices, selectAudio, selectSubtitle, subtitleChoices, type TrackVideo } from '../src/player/tracks';

describe('playback continuity', () => {
  it('resumes an unfinished item, but starts completed items from the beginning', () => {
    expect(resumePosition({ position: 400, duration: 1800 })).toBe(400);
    expect(resumePosition({ position: 1790, duration: 1800 })).toBe(0);
    expect(resumePosition({ position: 10, duration: 1800 })).toBe(0);
    expect(resumePosition({ position: Infinity, duration: 1800 })).toBe(0);
    expect(resumePosition({ position: 400, duration: 0, completed: true })).toBe(0);
    expect(isWatched({ position: 400, duration: 0, completed: true })).toBe(true);
    expect(isWatched({ position: 400, duration: Infinity })).toBe(false);
  });

  it('continues across seasons even when the provider returns episodes out of order', () => {
    const episodes = [{ id: '3', name: 'Third', season: 2, episode: 1 }, { id: '1', name: 'First', season: 1, episode: 1 }, { id: '2', name: 'Second', season: 1, episode: 2 }];
    expect(nextEpisode(episodes, '1')?.id).toBe('2');
    expect(nextEpisode(episodes, '2')?.id).toBe('3');
    expect(nextEpisode(episodes, '3')).toBeUndefined();
    expect(nextEpisode(episodes, 'missing')).toBeUndefined();
    expect(episodes[0]?.id).toBe('3');
  });

  it('bounds automatic recovery and restores its budget only after a reset', () => {
    const budget = new RecoveryBudget();
    expect([budget.nextDelay(), budget.nextDelay(), budget.nextDelay(), budget.nextDelay()]).toEqual([1000, 2000, 4000, undefined]);
    expect(budget.nextDelay()).toBeUndefined();
    budget.reset(); expect(budget.nextDelay()).toBe(1000);
  });
});

describe('track selection', () => {
  const nativeVideo = () => ({
    audioTracks: [{ label: 'English', language: 'en', enabled: true }, { label: '', language: 'pt', enabled: false }],
    textTracks: [{ kind: 'metadata', label: 'ID3', mode: 'hidden' }, { kind: 'captions', label: 'Português', mode: 'disabled' }, { kind: 'subtitles', label: 'English', mode: 'showing' }]
  }) as unknown as TrackVideo;

  it('switches native audio exclusively and ignores unsupported/invalid selection', () => {
    const video = nativeVideo();
    expect(audioChoices(video).map((track) => track.name)).toEqual(['English', 'pt']);
    selectAudio(video, 1);
    expect(audioChoices(video).map((track) => track.selected)).toEqual([false, true]);
    selectAudio(video, 99);
    expect(audioChoices(video)[1]?.selected).toBe(true);
    expect(audioChoices({ textTracks: [] } as unknown as TrackVideo)).toEqual([]);
  });

  it('preserves metadata tracks while switching or disabling captions and subtitles', () => {
    const video = nativeVideo();
    expect(subtitleChoices(video).map((track) => track.index)).toEqual([1, 2]);
    selectSubtitle(video, 1);
    expect(video.textTracks[0]?.mode).toBe('hidden');
    expect(video.textTracks[1]?.mode).toBe('showing');
    expect(video.textTracks[2]?.mode).toBe('disabled');
    selectSubtitle(video, -1);
    expect(subtitleChoices(video).some((track) => track.selected)).toBe(false);
  });

  it('uses the HLS engine for managed audio/subtitle tracks', () => {
    const video = nativeVideo();
    const engine = { audioTracks: [{ name: 'French' }, { lang: 'pt' }], audioTrack: 0, subtitleTracks: [{ name: 'German' }], subtitleTrack: -1, subtitleDisplay: false } as unknown as Hls;
    selectAudio(video, 1, engine);
    expect(engine.audioTrack).toBe(1);
    expect(video.audioTracks?.[0]?.enabled).toBe(true);
    selectSubtitle(video, 0, engine);
    expect(subtitleChoices(video, engine)[0]?.selected).toBe(true);
    selectSubtitle(video, -1, engine);
    expect(engine.subtitleDisplay).toBe(false);
    expect(engine.subtitleTrack).toBe(-1);
  });
});
