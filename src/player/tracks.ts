import type Hls from 'hls.js';

interface NativeAudioTrack { label: string; language: string; enabled: boolean }
interface NativeAudioList extends EventTarget { readonly length: number; [index: number]: NativeAudioTrack }
export type TrackVideo = HTMLVideoElement & { audioTracks?: NativeAudioList };
export interface TrackChoice { index: number; name: string; selected: boolean }

export function audioChoices(video: TrackVideo, hls?: Hls): TrackChoice[] {
  if (hls?.audioTracks.length) return hls.audioTracks.map((track, index) => ({ index, name: track.name || track.lang || '', selected: hls.audioTrack === index }));
  const list = video.audioTracks;
  return list ? Array.from({ length: list.length }, (_, index) => ({ index, name: list[index]!.label || list[index]!.language || '', selected: list[index]!.enabled })) : [];
}

export function subtitleChoices(video: TrackVideo, hls?: Hls): TrackChoice[] {
  if (hls?.subtitleTracks.length) return hls.subtitleTracks.map((track, index) => ({ index, name: track.name || track.lang || '', selected: hls.subtitleDisplay && hls.subtitleTrack === index }));
  return Array.from({ length: video.textTracks.length }, (_, index) => ({ track: video.textTracks[index]!, index }))
    .filter(({ track }) => track.kind === 'subtitles' || track.kind === 'captions')
    .map(({ track, index }) => ({ index, name: track.label || track.language || '', selected: track.mode === 'showing' }));
}

export function selectAudio(video: TrackVideo, index: number, hls?: Hls) {
  if (hls?.audioTracks.length) { if (hls.audioTracks[index]) hls.audioTrack = index; return; }
  const list = video.audioTracks;
  if (!list?.[index]) return;
  for (let i = 0; i < list.length; i++) list[i]!.enabled = i === index;
}

export function selectSubtitle(video: TrackVideo, index: number, hls?: Hls) {
  if (hls?.subtitleTracks.length) { if (index === -1 || hls.subtitleTracks[index]) { hls.subtitleTrack = index; hls.subtitleDisplay = index >= 0; } return; }
  const choices = subtitleChoices(video);
  if (index !== -1 && !choices.some((choice) => choice.index === index)) return;
  for (const choice of choices) video.textTracks[choice.index]!.mode = choice.index === index ? 'showing' : 'disabled';
}
