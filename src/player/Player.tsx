import type HlsType from 'hls.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { formatTime, Image, Progress } from '../components/common';
import type { RemoteAction } from '../platform/remote';
import type { Channel, Episode, EpgNow, MediaKind, SeriesItem, VodItem } from '../types';

export interface Playable {
  type: MediaKind; id: string; item: Channel | VodItem | Episode; extension?: string;
  channels?: Channel[]; series?: SeriesItem; resumeAt?: number;
}

interface TechnicalInfo {
  format: string; width?: number; height?: number; frameRate?: number;
  bitrate?: number; videoCodec?: string; audioCodec?: string;
}

function streamFormat(extension: string | undefined, isHls: boolean) {
  if (isHls) return 'HLS';
  const value = extension?.replace(/^\./, '').toLowerCase();
  if (value === 'ts') return 'MPEG-TS';
  if (value === 'mkv') return 'Matroska';
  return value?.toUpperCase() || 'Stream';
}

function codecName(codec: string | undefined) {
  const value = codec?.toLowerCase();
  if (!value) return undefined;
  if (value.startsWith('avc1') || value.startsWith('avc3')) return 'H.264';
  if (value.startsWith('hev1') || value.startsWith('hvc1')) return 'HEVC';
  if (value.startsWith('av01')) return 'AV1';
  if (value.startsWith('vp09') || value.startsWith('vp9')) return 'VP9';
  if (value.startsWith('mp4a')) return 'AAC';
  if (value.startsWith('ec-3')) return 'Dolby Digital Plus';
  if (value.startsWith('ac-3')) return 'Dolby Digital';
  if (value.startsWith('opus')) return 'Opus';
  return codec;
}

function bitrateLabel(bitrate: number | undefined) {
  if (!bitrate) return undefined;
  return bitrate >= 1_000_000 ? `${(bitrate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bitrate / 1_000)} kbps`;
}

export function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function clampSeekTime(value: number, duration: number) {
  if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(value, duration));
}

export function parseMediaDuration(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Math.max(0, Number(normalized));
  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(normalized)) {
    return normalized.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  const hours = Number(normalized.match(/(\d+(?:\.\d+)?)\s*h/)?.[1] || 0);
  const minutes = Number(normalized.match(/(\d+(?:\.\d+)?)\s*m/)?.[1] || 0);
  const seconds = Number(normalized.match(/(\d+(?:\.\d+)?)\s*s/)?.[1] || 0);
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export function Player({ media, registerAction, close }: { media: Playable; registerAction: (handler: ((action: RemoteAction) => boolean) | null) => void; close: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const hls = useRef<HlsType>(); const hideTimer = useRef<number>(); const resumeApplied = useRef(false);
  const [overlay, setOverlay] = useState(true); const [mini, setMini] = useState(false); const [miniIndex, setMiniIndex] = useState(0);
  const [active, setActive] = useState(media); const [epg, setEpg] = useState<EpgNow>(); const [state, setState] = useState<'loading'|'playing'|'paused'|'error'>('loading');
  const [technical, setTechnical] = useState<TechnicalInfo>({ format: 'Stream' });
  const [position, setPosition] = useState(0); const [duration, setDuration] = useState(0); const [buffered, setBuffered] = useState(0);
  const channels = active.channels || [];
  const metadataDuration = 'duration' in active.item ? parseMediaDuration(active.item.duration) : 0;
  const playableDuration = (element: HTMLVideoElement) => {
    if (Number.isFinite(element.duration) && element.duration > 0) return element.duration;
    if (element.seekable.length) {
      const seekableEnd = element.seekable.end(element.seekable.length - 1);
      if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
    }
    return metadataDuration;
  };
  const start = async () => {
    const element = video.current; if (!element) return;
    setState('loading'); setPosition(0); setDuration(0); setBuffered(0); resumeApplied.current = false; hls.current?.destroy(); hls.current = undefined;
    const url = api.playUrl(active.type, active.id, active.extension);
    const isHls = active.extension === 'm3u8' || (active.type === 'live' && url.includes('ext=m3u8'));
    setTechnical({ format: streamFormat(active.extension, isHls) });
    if (isHls && !element.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) { setState('error'); return; }
      const instance = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 }); hls.current = instance;
      instance.loadSource(url); instance.attachMedia(element);
      instance.on(Hls.Events.MANIFEST_PARSED, () => void element.play().catch(() => setState('error')));
      instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = instance.levels[data.level]; if (!level) return;
        setTechnical((current) => ({ ...current, width: level.width || element.videoWidth || undefined, height: level.height || element.videoHeight || undefined, frameRate: level.frameRate || undefined, bitrate: level.bitrate || undefined, videoCodec: level.videoCodec, audioCodec: level.audioCodec }));
      });
      instance.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setState('error'); });
    } else { element.src = url; void element.play().catch(() => setState('error')); }
  };
  const show = () => { setOverlay(true); window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => setOverlay(false), 4500); };
  const syncPlayback = () => {
    const element = video.current; if (!element) return;
    const nextDuration = playableDuration(element);
    const nextPosition = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    const bufferedEnd = element.buffered.length ? element.buffered.end(element.buffered.length - 1) : 0;
    setDuration(nextDuration); setPosition(nextPosition); setBuffered(nextDuration ? clampSeekTime(bufferedEnd, nextDuration) : 0);
  };
  const seekTo = (nextPosition: number) => {
    const element = video.current; if (!element || active.type === 'live') return;
    const nextDuration = playableDuration(element) || duration;
    if (!nextDuration) return;
    const target = clampSeekTime(nextPosition, nextDuration);
    element.currentTime = target; setPosition(target); show();
  };
  const applyResume = () => {
    const element = video.current; if (!element || resumeApplied.current || active.type === 'live') return;
    const nextDuration = playableDuration(element);
    if (active.resumeAt && !nextDuration) return;
    resumeApplied.current = true;
    if (active.resumeAt) element.currentTime = clampSeekTime(active.resumeAt, nextDuration);
    syncPlayback();
  };
  const switchChannel = (index: number) => {
    const channel = channels[(index + channels.length) % channels.length]; if (!channel) return;
    setActive({ type: 'live', id: channel.id, item: channel, extension: channel.extension, channels }); setMiniIndex((index + channels.length) % channels.length); setMini(false); show();
  };
  useEffect(() => { void start(); }, [active.id]);
  useEffect(() => { if (active.type === 'live') api.epg(active.id).then(setEpg).catch(() => setEpg(undefined)); }, [active.id]);
  useEffect(() => { const index = channels.findIndex((channel) => channel.id === active.id); if (index >= 0) setMiniIndex(index); }, [active.id]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { if (state === 'loading') setState('error'); }, 18_000); return () => window.clearTimeout(timeout);
  }, [active.id, state]);
  useEffect(() => {
    registerAction((action) => {
      const element = video.current;
      if (action === 'BACK') { if (mini) { setMini(false); return true; } if (overlay) { setOverlay(false); return true; } return false; }
      if (action === 'SELECT') { if (state === 'error') { void start(); return true; } if (mini) { switchChannel(miniIndex); return true; } overlay ? setOverlay(false) : show(); return true; }
      if (action === 'NAV_LEFT' && active.type === 'live') { setMini(true); setOverlay(true); return true; }
      if (mini && action === 'NAV_UP') { setMiniIndex((value) => Math.max(0, value - 1)); return true; }
      if (mini && action === 'NAV_DOWN') { setMiniIndex((value) => Math.min(channels.length - 1, value + 1)); return true; }
      if (!mini && (action === 'NAV_UP' || action === 'CHANNEL_UP') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) - 1); return true; }
      if (!mini && (action === 'NAV_DOWN' || action === 'CHANNEL_DOWN') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) + 1); return true; }
      if (action === 'NAV_LEFT' && active.type !== 'live') { seekTo((element?.currentTime || 0) - 10); return true; }
      if (action === 'NAV_RIGHT' && active.type !== 'live') { seekTo((element?.currentTime || 0) + 30); return true; }
      if ((action === 'PLAY' || action === 'PAUSE') && element) { action === 'PLAY' ? void element.play() : element.pause(); show(); return true; }
      if (action === 'STOP') { close(); return true; }
      if ((action === 'FAST_FORWARD' || action === 'REWIND') && element && active.type !== 'live') { seekTo(element.currentTime + (action === 'FAST_FORWARD' ? 30 : -10)); return true; }
      return true;
    });
    return () => registerAction(null);
  }, [active, overlay, mini, miniIndex, state]);
  useEffect(() => () => {
    const element = video.current;
    api.watched({ type: active.type, id: active.id, item: active.item, position: element?.currentTime || 0, duration: element?.duration || 0 }).catch(() => undefined);
    hls.current?.destroy(); window.clearTimeout(hideTimer.current);
  }, [active.id]);
  const updateDimensions = () => {
    const element = video.current; if (!element?.videoWidth || !element.videoHeight) return;
    setTechnical((current) => ({ ...current, width: element.videoWidth, height: element.videoHeight }));
  };
  const item = active.item; const title = item.name; const logo = 'logo' in item ? item.logo : undefined;
  const playedPercent = duration ? Math.min(100, (position / duration) * 100) : 0;
  const bufferedPercent = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const quality = technical.width && technical.height ? `${technical.width} × ${technical.height}${technical.frameRate ? ` · ${Math.round(technical.frameRate)} FPS` : ''}` : technical.frameRate ? `${Math.round(technical.frameRate)} FPS` : undefined;
  const technicalRows = [['Format', technical.format], ['Quality', quality], ['Video', codecName(technical.videoCodec)], ['Audio', codecName(technical.audioCodec)], ['Bitrate', bitrateLabel(technical.bitrate)]].filter((row): row is string[] => Boolean(row[1]));
  return <main className="player-screen"><video ref={video} autoplay playsInline onLoadedMetadata={() => { updateDimensions(); applyResume(); }} onDurationChange={() => { syncPlayback(); applyResume(); }} onTimeUpdate={syncPlayback} onProgress={syncPlayback} onSeeking={syncPlayback} onResize={updateDimensions} onPlaying={() => { setState('playing'); updateDimensions(); show(); }} onPause={() => setState('paused')} onError={() => setState('error')} />
    {state === 'loading' && <div className="player-status"><span className="spinner" />Loading stream…</div>}
    {state === 'error' && <div className="player-error"><h2>Unable to play this stream</h2><p>The provider may be unavailable, or this TV may not support the stream codec or container.</p><div><button onClick={() => void start()}>Retry</button><button onClick={close}>Back</button></div><small>Press OK to retry · Back to return</small></div>}
    {mini && <aside className="mini-list"><h2>Channels</h2>{channels.slice(Math.max(0, miniIndex - 4), miniIndex + 5).map((channel) => <div key={channel.id} className={channels[miniIndex]?.id === channel.id ? 'mini-selected' : ''}><Image src={channel.logo} alt={channel.name} /><span>{channel.name}</span>{active.id === channel.id && <b>LIVE</b>}</div>)}<small>OK switches channel</small></aside>}
    {overlay && state !== 'error' && <section className="player-overlay">
      <div className="player-now"><Image src={logo} alt={title} className="overlay-logo" /><div><span className="eyebrow">{active.type === 'live' ? 'LIVE NOW' : active.type === 'movie' ? 'MOVIE' : 'EPISODE'}</span><h1>{title}</h1>{epg?.current && <><strong>{epg.current.title}</strong><small>{formatTime(epg.current.start)} – {formatTime(epg.current.end)}</small></>}</div></div>
      {active.type === 'live' ? <><Progress value={epg?.progress || 0} />{epg?.next && <div className="overlay-next"><span>Next · {formatTime(epg.next.start)}</span><strong>{epg.next.title}</strong></div>}</> : <div className="playback-timeline">
        <div className="timeline-times"><span>{formatPlaybackTime(position)}</span><span>{duration ? formatPlaybackTime(duration) : '--:--'}</span></div>
        <div className="timeline-control" role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={`${formatPlaybackTime(position)} of ${duration ? formatPlaybackTime(duration) : 'unknown'}`}><div className="timeline-track" aria-hidden="true"><div className="timeline-buffered" style={{ width: `${bufferedPercent}%` }} /><div className="timeline-played" style={{ width: `${playedPercent}%` }} /><div className="timeline-thumb" style={{ left: `${playedPercent}%` }} /></div></div>
      </div>}
      <div className="playback-tech" aria-label="Playback technical information">{technicalRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
      <div className="overlay-hints">{active.type === 'live' ? <><span>↑ ↓ Change channel</span><span>← Channel list</span></> : <><span>← 10s rewind</span><span>30s forward →</span></>}<span>OK Hide info</span><span>Back Exit</span></div>
    </section>}
  </main>;
}
